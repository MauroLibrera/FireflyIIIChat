// Reenvía la respuesta remota sin asumir que el cuerpo es JSON.
// Un 204, una página de error de un reverse proxy o un cuerpo vacío ya no
// se convierten en un 500 que oculta la causa real.
export async function forwardResponse(res, response, origen) {
  if (response.status === 204 || response.status === 304) {
    return res.status(response.status).end();
  }

  const raw = await response.text();
  if (!raw) {
    return res.status(response.status).end();
  }

  // El parseo va adentro del try; el send va afuera. Si el try también
  // envolviera el send y este llegara a tirar (headers ya mandados), el
  // catch intentaría mandar una segunda respuesta, que tira de nuevo y se
  // escapa como un unhandled rejection: el mismo crash que el await de los
  // handlers existe para evitar, pero por otra puerta.
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return res.status(502).json({
      error: `${origen} devolvió una respuesta que no es JSON.`,
      upstreamStatus: response.status,
      body: raw.slice(0, 300)
    });
  }

  return res.status(response.status).json(parsed);
}
