import { seguirFlujo } from './flujo-sse';
import { ErrorCuenta } from './auth.service';

describe('Consumidor SSE de Parqueaderos', () => {
  it('conserva el 401 si obtener el token falla antes de abrir HTTP', async () => {
    const caer = jasmine.createSpy('caer'), fetchSpy = spyOn(globalThis, 'fetch');
    seguirFlujo('/fixture', async () => { throw new ErrorCuenta('SIN_SESION', 'Tu sesión terminó.', 401); }, 'ocupacion', () => fail('no hay datos'), caer);
    await new Promise(r => setTimeout(r, 0)); expect(caer).toHaveBeenCalledOnceWith('Tu sesión terminó.', 401); expect(fetchSpy).not.toHaveBeenCalled();
  });
  it('comunica cierre terminal, descarta datos posteriores y libera el reader', async () => {
    const cancelar = jasmine.createSpy('cancelar'), recibir = jasmine.createSpy('recibir'), caer = jasmine.createSpy('caer');
    const body = new ReadableStream<Uint8Array>({ start(c) {
      c.enqueue(new TextEncoder().encode('event: sesion_finalizada\ndata: {"codigo":"SIN_AUTENTICAR"}\n\nevent: ocupacion\ndata: {"tardio":true}\n\n'));
    }, cancel: cancelar });
    const fetchSpy = spyOn(globalThis, 'fetch').and.resolveTo(new Response(body, { headers: { 'Content-Type': 'text/event-stream' } }));
    seguirFlujo('/api/v1/parqueaderos/eventos/fixture/ocupacion/flujo', async () => 'fixture-en-cabecera', 'ocupacion', recibir, caer);
    await new Promise(r => setTimeout(r, 0));
    expect(recibir).not.toHaveBeenCalled(); expect(caer).toHaveBeenCalledOnceWith('Tu sesión terminó.', 401);
    expect(cancelar).toHaveBeenCalledTimes(1); expect(body.locked).toBeFalse();
    const args = fetchSpy.calls.mostRecent().args; expect(String(args[0])).not.toContain('fixture-en-cabecera');
    expect((args[1]?.headers as Record<string, string>)['Authorization']).toBe('Bearer fixture-en-cabecera');
    expect(args[1]?.signal?.aborted).toBeTrue();
  });
  it('propaga el rechazo inicial sin abrir ni reconectar el stream', async () => {
    const caer = jasmine.createSpy('caer'); const fetchSpy = spyOn(globalThis, 'fetch').and.resolveTo(new Response('{}', { status: 503 }));
    seguirFlujo('/fixture', async () => 'fixture', 'ocupacion', () => fail('no hay datos'), caer);
    await new Promise(r => setTimeout(r, 0)); expect(caer).toHaveBeenCalledOnceWith('El flujo respondió 503', 503); expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});
