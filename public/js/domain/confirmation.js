const AFIRMATIVAS = ['si', 'sí', 'correcto', 'dale', 'ok', 'confirmar', 's', 'confirmo', 'ya', 'claro', 'de una'];
const NEGATIVAS = ['no', 'cancelar', 'incorrecto', 'n', 'pará', 'espera', 'cancela'];

// La comparación es contra el mensaje completo: "no gasté 3000" es una
// corrección, no una cancelación.
export function isAffirmative(texto) {
  return AFIRMATIVAS.includes(String(texto).trim().toLowerCase());
}

export function isNegative(texto) {
  return NEGATIVAS.includes(String(texto).trim().toLowerCase());
}

export function nextAction(pendingIntent, texto) {
  if (!pendingIntent) return 'interpret';
  if (isAffirmative(texto)) return 'confirm';
  if (isNegative(texto)) return 'cancel';
  return 'interpret';
}
