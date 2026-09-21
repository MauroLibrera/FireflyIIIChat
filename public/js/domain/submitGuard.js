// Evita que un mismo envío se dispare dos veces en paralelo. Sin esto, el
// reintento de R4 abrió una ventana real: la ruta sin confirmación deja
// pendingIntent puesto mientras el POST a Firefly todavía está en vuelo, y
// domain/confirmation.js trata palabras sueltas ("ok", "dale", "ya") como
// afirmativas, así que escribir una de esas y apretar Enter mientras el
// primer envío sigue en curso dispara un segundo confirmPendingIntent() para
// la misma intención: Firefly recibe la transacción dos veces.
//
// Puro: sin fetch, sin DOM, sin reloj. app.js lo cablea a sendBtn.disabled
// (defensa en la UI) y acá queda la defensa en la lógica, para que ningún
// otro punto de entrada futuro pueda saltearse el guard.
export function createSubmitGuard() {
  let busy = false;

  return {
    // true si logró tomar el turno (y lo deja ocupado); false si ya había
    // un envío en curso, sin tocar el estado.
    tryStart() {
      if (busy) return false;
      busy = true;
      return true;
    },

    finish() {
      busy = false;
    },

    get busy() {
      return busy;
    }
  };
}
