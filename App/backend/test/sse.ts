/**
 * Lee el primer mensaje de un flujo Server-Sent Events y corta la conexión.
 * Lo usan las e2e de los paneles en vivo (CU-010, CU-019, CU-025).
 */
export async function primerMensajeSse(url: string, token: string, limiteMs = 10000): Promise<string> {
  const control = new AbortController();
  const corte = setTimeout(() => control.abort(), limiteMs);
  try {
    const respuesta = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal: control.signal });
    if (!respuesta.ok || !respuesta.body) throw new Error(`SSE ${url} → ${respuesta.status}`);
    const lector = respuesta.body.getReader();
    const decodificador = new TextDecoder();
    let texto = '';
    while (!texto.includes('\n\n')) {
      const { value, done } = await lector.read();
      if (done) break;
      texto += decodificador.decode(value, { stream: true });
    }
    return texto;
  } finally {
    clearTimeout(corte);
    control.abort();
  }
}
