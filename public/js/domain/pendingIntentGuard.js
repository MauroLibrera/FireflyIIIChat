// Ata cada tarjeta de confirmación a la intención con la que se la armó, en
// vez de dejar que confirmPendingIntent/cancelPendingIntent relean
// pendingIntent recién al momento del click. Sin este chequeo, una tarjeta
// vieja (armada para la intención A) sigue con sus botones activos cuando el
// usuario escribe una corrección en vez de tocar Cancelar: pendingIntent pasa
// a ser la intención B, se renderiza una tarjeta B debajo, y clickear ✅ en la
// tarjeta A todavía dispara confirmPendingIntent(), que releía el
// pendingIntent *actual* (B) y terminaba escribiendo B mientras la tarjeta
// que el usuario miró mostraba A.
//
// La comparación es de identidad de objeto, no de contenido: dos intenciones
// con los mismos campos pero armadas en interpretaciones distintas del
// modelo no son "la misma tarjeta", aunque luzcan iguales. Esto hace que el
// vínculo tarjeta→payload sea una propiedad del código, no del DOM.
//
// Puro: sin DOM, sin fetch, sin reloj.
export function canConfirmPendingIntent(intentShown, currentPendingIntent) {
  if (!currentPendingIntent) return false;
  return intentShown === currentPendingIntent;
}
