// Valida la intención que devolvió el modelo antes de que llegue a Firefly.
// response_format: json_object garantiza JSON bien formado, no que describa
// algo real: una cuenta inventada o una fecha imposible tienen que frenarse
// acá, no como un 422 de Firefly que el usuario no puede interpretar.
//
// Puro: sin fetch, sin DOM, sin lectura de reloj. "today" llega en el
// contexto para que el módulo corra igual bajo Node que en el navegador.

const TIPOS_VALIDOS = ['withdrawal', 'deposit', 'transfer', 'query'];

function normalizarTexto(valor) {
  return typeof valor === 'string' ? valor.trim().toLowerCase() : '';
}

function esFechaValida(fecha) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fecha);
  if (!match) return false;

  const anio = Number(match[1]);
  const mes = Number(match[2]);
  const dia = Number(match[3]);
  const fechaUtc = new Date(Date.UTC(anio, mes - 1, dia));

  // Date normaliza en silencio "30 de febrero" a "2 de marzo": comparar los
  // componentes de vuelta es la única forma de detectar una fecha inventada.
  return fechaUtc.getUTCFullYear() === anio && fechaUtc.getUTCMonth() === mes - 1 && fechaUtc.getUTCDate() === dia;
}

// Busca la cuenta sincronizada que coincide exactamente (sin mayúsculas ni
// espacios sobrantes) con lo que devolvió el modelo.
function encontrarCuenta(cuentas, nombreBuscado) {
  const buscado = normalizarTexto(nombreBuscado);
  return cuentas.find((cuenta) => normalizarTexto(cuenta) === buscado);
}

// Si no hay coincidencia exacta, ofrece la cuenta sincronizada más parecida
// en vez de inventar una: la primera que contenga el texto buscado, o que
// esté contenida en él. Si ninguna cuenta cumple eso, no sugiere nada.
function sugerirCuenta(cuentas, nombreBuscado) {
  const buscado = normalizarTexto(nombreBuscado);
  if (!buscado) return null;

  return (
    cuentas.find((cuenta) => {
      const normalizada = normalizarTexto(cuenta);
      return normalizada.includes(buscado) || buscado.includes(normalizada);
    }) || null
  );
}

function rechazar(reason, field) {
  return { ok: false, reason, field };
}

function validarCuenta(cuentas, nombreBuscado, campo) {
  if (encontrarCuenta(cuentas, nombreBuscado)) return null;

  const sugerencia = sugerirCuenta(cuentas, nombreBuscado);
  const reason = sugerencia
    ? `La cuenta "${nombreBuscado}" no existe entre tus cuentas sincronizadas. ¿Quisiste decir "${sugerencia}"?`
    : `La cuenta "${nombreBuscado}" no existe entre tus cuentas sincronizadas.`;

  return rechazar(reason, campo);
}

export function validateIntent(raw, context) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return rechazar('El modelo devolvió una respuesta con un formato inesperado.', null);
  }

  if (!TIPOS_VALIDOS.includes(raw.type)) {
    return rechazar(`No reconozco el tipo de operación "${raw.type}".`, 'type');
  }

  const intent = { ...raw };

  if (intent.type !== 'query') {
    const monto = Number(intent.amount);
    if (!Number.isFinite(monto) || monto <= 0) {
      return rechazar(`El monto "${raw.amount}" no es válido.`, 'amount');
    }
    intent.amount = monto;
  }

  if (intent.date !== undefined && intent.date !== null) {
    if (typeof intent.date !== 'string' || !esFechaValida(intent.date)) {
      return rechazar(`La fecha "${raw.date}" no es válida.`, 'date');
    }
  } else {
    intent.date = context.today;
  }

  if (intent.installments !== undefined && intent.installments !== null) {
    // Mismo criterio que "amount": una cadena numérica se coerciona, no se
    // rechaza. La corrección de la ronda 1 hizo explícito que el brief
    // original diferenciaba installments de amount sin motivo real.
    const cuotas = Number(intent.installments);
    if (!Number.isInteger(cuotas) || cuotas < 1) {
      return rechazar(`La cantidad de cuotas "${raw.installments}" no es válida.`, 'installments');
    }
    intent.installments = cuotas;
  } else {
    intent.installments = 1;
  }

  if (intent.type === 'withdrawal') {
    const error = validarCuenta(context.assetAccounts || [], intent.source_name, 'source_name');
    if (error) return error;
  }

  if (intent.type === 'deposit') {
    const error = validarCuenta(context.assetAccounts || [], intent.destination_name, 'destination_name');
    if (error) return error;
  }

  if (intent.type === 'transfer') {
    // "Movimiento entre dos cuentas de activo propias" (prompt.js): un
    // transfer mueve plata entre DOS cuentas sincronizadas, así que ambas
    // puntas se validan igual que source_name/destination_name en
    // withdrawal/deposit. Se reporta el primer campo que falla.
    const cuentas = context.assetAccounts || [];
    const errorOrigen = validarCuenta(cuentas, intent.source_name, 'source_name');
    if (errorOrigen) return errorOrigen;

    const errorDestino = validarCuenta(cuentas, intent.destination_name, 'destination_name');
    if (errorDestino) return errorDestino;
  }

  return { ok: true, intent };
}

// Decide a qué rama de app.js tiene que ir una intención ya validada por
// validateIntent. El chequeo de "query" va primero y es incondicional: una
// consulta nunca puede llegar al camino de escritura (tarjeta de
// confirmación o envío directo), sin importar qué haya pedido el modelo en
// requiere_confirmacion. validateIntent no le exige "amount" a una query
// (queda undefined), así que dejarla pasar por esa rama termina en un 422 de
// Firefly ("NaN" como monto) en vez de fallar acá, donde se puede explicar.
//
// Puro: solo mira el objeto intent, sin DOM ni fetch.
export function resolveIntentRoute(intent) {
  if (intent.type === 'query') return 'query';
  if (intent.requiere_confirmacion) return 'confirm';
  return 'submit';
}
