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

  try {
    return res.status(response.status).json(JSON.parse(raw));
  } catch {
    return res.status(502).json({
      error: `${origen} devolvió una respuesta que no es JSON.`,
      upstreamStatus: response.status,
      body: raw.slice(0, 300)
    });
  }
}
