import { ErrorCuenta } from './auth.service';

/**
 * Lee un flujo de Server-Sent Events con `fetch`: `EventSource` no deja mandar
 * la cabecera de autorización. Mismo esquema que el monitoreo (CU-019).
 * Devuelve la función que corta el flujo; si se cae o termina, avisa con
 * `alCaer` y quien llama decide reconectar.
 */
export function seguirFlujo<T>(
  url: string,
  token: () => Promise<string>,
  tipo: string,
  alRecibir: (datos: T) => void,
  alCaer: (motivo: string, estado?: number) => void
): () => void {
  const control = new AbortController();
  void (async () => {
    let lector: ReadableStreamDefaultReader<Uint8Array> | undefined;
    try {
      const respuesta = await fetch(url, {
        headers: { Authorization: `Bearer ${await token()}`, Accept: 'text/event-stream' },
        signal: control.signal
      });
      if (!respuesta.ok || !respuesta.body) {
        alCaer(`El flujo respondió ${respuesta.status}`, respuesta.status);
        return;
      }
      lector = respuesta.body.getReader();
      const decoder = new TextDecoder();
      let pendiente = '';
      for (;;) {
        const { value, done } = await lector.read();
        if (done) break;
        pendiente += decoder.decode(value, { stream: true });
        let corte: number;
        while ((corte = pendiente.indexOf('\n\n')) >= 0) {
          const bloque = pendiente.slice(0, corte);
          pendiente = pendiente.slice(corte + 2);
          const evento = /^event: (.+)$/m.exec(bloque)?.[1];
          const datos = bloque.split('\n').filter((l) => l.startsWith('data: ')).map((l) => l.slice(6)).join('\n');
          if (evento === 'sesion_finalizada') {
            const codigo = datos ? (JSON.parse(datos) as { codigo?: string }).codigo : undefined;
            alCaer(codigo === 'SIN_AUTENTICAR' ? 'Tu sesión terminó.' : 'No se puede mantener el flujo en este momento.', codigo === 'SIN_AUTENTICAR' ? 401 : 503);
            return;
          }
          if (evento === tipo && datos) alRecibir(JSON.parse(datos) as T);
        }
      }
      if (!control.signal.aborted) alCaer('El servidor cerró el flujo.');
    } catch (e) {
      if (!control.signal.aborted) alCaer(e instanceof Error ? e.message : 'Sin conexión con el flujo.', e instanceof ErrorCuenta ? e.estado : undefined);
    } finally {
      control.abort();
      await lector?.cancel().catch(() => undefined);
      lector?.releaseLock();
    }
  })();
  return () => control.abort();
}
