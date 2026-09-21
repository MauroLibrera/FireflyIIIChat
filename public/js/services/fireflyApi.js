import { splitAmountIntoInstallments, installmentDates } from '../domain/installments.js';
import { toIsoDate } from '../domain/format.js';

const DEFAULT_MAX_PAGES = 20;

// fetch no tiene timeout por defecto: si el proxy se cuelga, la página se
// cuelga con él. Este límite es sobre el salto navegador -> proxy; el proxy
// tiene el suyo propio (server/proxy/firefly.js) para el salto proxy ->
// Firefly, y ambos valen 15000 por la misma razón sin ser el mismo timeout.
export const FIREFLY_TIMEOUT_MS = 15000;

export function createFireflyApi({ fetchImpl = fetch, getHeaders, maxPages = DEFAULT_MAX_PAGES, now = () => new Date(), timeoutMs = FIREFLY_TIMEOUT_MS }) {
  async function request(path, options = {}) {
    try {
      return await fetchImpl(path, { ...options, headers: getHeaders(), signal: AbortSignal.timeout(timeoutMs) });
    } catch (err) {
      // Un abort por timeout no puede llegarle al usuario como "AbortError":
      // esa palabra no le dice qué pasó. Cualquier otro error sigue de largo.
      if (err.name === 'AbortError') {
        throw new Error('La solicitud a Firefly III superó el tiempo de espera.');
      }
      throw err;
    }
  }

  // Firefly III devuelve 50 elementos por página; sin esto el modelo no veía
  // el resto de los datos.
  async function fetchAllPages(ruta) {
    const items = [];
    let pagina = 1;
    let totalPaginas = 1;

    do {
      const separador = ruta.includes('?') ? '&' : '?';
      const res = await request(`${ruta}${separador}limit=100&page=${pagina}`);
      if (!res.ok) throw new Error(`Error consultando ${ruta} (HTTP ${res.status}).`);

      const json = await res.json();
      items.push(...(json.data || []));

      const paginacion = json.meta && json.meta.pagination;
      totalPaginas = (paginacion && paginacion.total_pages) || 1;
      pagina++;
    } while (pagina <= totalPaginas && pagina <= maxPages);

    return items;
  }

  async function loadReferenceData() {
    const [asset, revenue, tags, categories] = await Promise.all([
      fetchAllPages('/api/firefly/accounts?type=asset'),
      fetchAllPages('/api/firefly/accounts?type=revenue'),
      fetchAllPages('/api/firefly/tags'),
      fetchAllPages('/api/firefly/categories')
    ]);

    return {
      assetAccounts: asset.map((a) => a.attributes.name),
      revenueAccounts: revenue.map((a) => a.attributes.name),
      tags: tags.map((t) => t.attributes.tag),
      categories: categories.map((c) => c.attributes.name)
    };
  }

  async function createTransaction(intent) {
    const numCuotas = intent.installments || 1;
    // Un JSON válido no garantiza un "date" poblado: el modelo puede omitirlo.
    // Sin este default se cae con "Cannot read properties of undefined (reading 'split')".
    const fechaInicial = intent.date || toIsoDate(now());
    const montos = splitAmountIntoInstallments(intent.amount, numCuotas);
    const fechas = installmentDates(fechaInicial, numCuotas);

    const transactions = montos.map((amount, i) => ({
      type: intent.type,
      date: fechas[i],
      amount,
      description: numCuotas > 1 ? `${intent.description} (Cuota ${i + 1}/${numCuotas})` : intent.description,
      source_name: intent.source_name,
      destination_name: intent.destination_name,
      category_name: intent.category_name || null,
      tags: intent.tags || []
    }));

    const payload = { transactions };
    if (numCuotas > 1) {
      payload.group_title = `${intent.description} (${numCuotas} cuotas)`;
    }

    const res = await request('/api/firefly/transactions', { method: 'POST', body: JSON.stringify(payload) });

    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      throw new Error(errorData.message || 'Error al registrar en Firefly III.');
    }
  }

  async function balances() {
    const cuentas = await fetchAllPages('/api/firefly/accounts?type=asset');
    return cuentas.map((a) => ({
      nombre: a.attributes.name,
      saldo: parseFloat(a.attributes.current_balance),
      moneda: a.attributes.currency_symbol || '$'
    }));
  }

  // Firefly solo devuelve "spent" cuando se acota el rango de fechas.
  async function budgets({ start, end }) {
    const res = await request(`/api/firefly/budgets?start=${start}&end=${end}`);
    if (!res.ok) throw new Error('No se pudieron consultar los presupuestos.');

    const json = await res.json();
    return (json.data || []).map((b) => ({
      name: b.attributes.name,
      spent: b.attributes.spent ? Math.abs(parseFloat(b.attributes.spent[0]?.sum || 0)) : 0
    }));
  }

  async function recentTransactions({ end, limit = 10 }) {
    const res = await request(`/api/firefly/transactions?limit=${limit}&page=1&order=date&dir=desc&end=${end}`);
    if (!res.ok) throw new Error('No se pudieron consultar las últimas transacciones.');

    const json = await res.json();
    const salida = [];

    for (const group of json.data || []) {
      for (const tx of (group.attributes && group.attributes.transactions) || []) {
        salida.push(tx);
      }
    }

    return salida;
  }

  return { fetchAllPages, loadReferenceData, createTransaction, balances, budgets, recentTransactions };
}
