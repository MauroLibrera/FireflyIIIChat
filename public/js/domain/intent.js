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
    // A diferencia de "amount", una cadena numérica NO se coerciona acá: el
    // contrato de coerción es específico para el monto (ver Task 1 brief).
    if (typeof intent.installments !== 'number' || !Number.isInteger(intent.installments) || intent.installments < 1) {
      return rechazar(`La cantidad de cuotas "${raw.installments}" no es válida.`, 'installments');
    }
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

  return { ok: true, intent };
}
