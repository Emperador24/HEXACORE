import { ConfiguracionServicio } from '../../config/configuracion';
import { PasarelaHttp } from './pasarela-http.service';
import { ResultadoCobro, SolicitudCobro } from './procesador-pagos';

/**
 * El trabajo real de este adaptador es **traducir fallos de red al vocabulario
 * del dominio**, y ahí se toma la decisión más delicada de todo el CU-006:
 * distinguir un cobro rechazado de uno cuyo resultado se desconoce.
 *
 * Confundirlos tiene consecuencias opuestas. Tratar un INDETERMINADO como
 * RECHAZADO libera la publicación y da por seguro que no se cobró, cuando
 * quizá sí: el comprador se queda sin entrada y con el cargo. Por eso estas
 * pruebas insisten tanto en que cada forma de fallar caiga donde debe.
 *
 * Se sustituye `fetch` por un doble, que es lo que RNF-18 pide del 100 % de las
 * dependencias externas.
 */
describe('PasarelaHttp', () => {
  const config = {
    pasarelaPagos: { url: 'http://pasarela.prueba', timeoutMs: 5000 },
  } as ConfiguracionServicio;

  const solicitud: SolicitudCobro = {
    monto: 300000,
    moneda: 'COP',
    token: 'tok_prueba',
    descripcion: 'Reventa de prueba',
    claveIdempotencia: '7f3c1e2a-5d4b-4c8e-9a1f-2b3c4d5e6f70',
  };

  let pasarela: PasarelaHttp;
  let fetchOriginal: typeof globalThis.fetch;

  beforeEach(() => {
    fetchOriginal = globalThis.fetch;
    pasarela = new PasarelaHttp(config);
  });

  afterEach(() => {
    globalThis.fetch = fetchOriginal;
    jest.restoreAllMocks();
  });

  /** Doble de `fetch` que responde lo que se le indique. */
  function responderCon(estado: number, cuerpo: unknown): jest.Mock {
    const doble = jest.fn().mockResolvedValue({
      ok: estado >= 200 && estado < 300,
      status: estado,
      json: () => Promise.resolve(cuerpo),
      text: () => Promise.resolve(JSON.stringify(cuerpo)),
    });
    globalThis.fetch = doble as unknown as typeof globalThis.fetch;
    return doble;
  }

  /** Doble de `fetch` que falla como falla la red. */
  function fallarCon(error: Error): void {
    globalThis.fetch = jest.fn().mockRejectedValue(error) as unknown as typeof globalThis.fetch;
  }

  describe('cobro aprobado', () => {
    it('devuelve APROBADO con la referencia de la pasarela', async () => {
      responderCon(200, { estado: 'APROBADO', referencia: 'pas_abc123' });

      const respuesta = await pasarela.cobrar(solicitud);

      expect(respuesta.resultado).toBe(ResultadoCobro.APROBADO);
      expect(respuesta.referencia).toBe('pas_abc123');
    });

    it('trata como INDETERMINADO una aprobación sin referencia', async () => {
      // Sin referencia no se puede conciliar después, y la restricción CHECK de
      // la base rechazaría la fila. Mejor admitir que no se sabe que guardar una
      // aprobación que nadie puede rastrear.
      responderCon(200, { estado: 'APROBADO' });

      const respuesta = await pasarela.cobrar(solicitud);

      expect(respuesta.resultado).toBe(ResultadoCobro.INDETERMINADO);
    });

    it('manda la clave de idempotencia y nunca datos de tarjeta', async () => {
      const doble = responderCon(200, { estado: 'APROBADO', referencia: 'pas_abc' });

      await pasarela.cobrar(solicitud);

      const [, opciones] = doble.mock.calls[0] as [string, RequestInit];
      const cabeceras = opciones.headers as Record<string, string>;
      expect(cabeceras['Idempotency-Key']).toBe(solicitud.claveIdempotencia);

      // RNF-05: del medio de pago solo viaja el token.
      const cuerpo = JSON.parse(opciones.body as string) as Record<string, unknown>;
      expect(Object.keys(cuerpo).sort()).toEqual(['descripcion', 'moneda', 'monto', 'token']);
      expect(JSON.stringify(cuerpo)).not.toMatch(/pan|cvv|cvc|expiracion|numeroTarjeta/i);
    });
  });

  describe('CU-006G — la pasarela responde que no', () => {
    it('devuelve RECHAZADO con el motivo que dio la pasarela', async () => {
      responderCon(200, { estado: 'RECHAZADO', motivo: 'Fondos insuficientes' });

      const respuesta = await pasarela.cobrar(solicitud);

      expect(respuesta.resultado).toBe(ResultadoCobro.RECHAZADO);
      expect(respuesta.motivo).toBe('Fondos insuficientes');
    });

    it('trata un 4xx como rechazo, porque la pasarela entendió y no cobró', async () => {
      responderCon(400, { error: 'monto inválido' });

      const respuesta = await pasarela.cobrar(solicitud);

      expect(respuesta.resultado).toBe(ResultadoCobro.RECHAZADO);
    });
  });

  describe('CU-006I — no se sabe si se cobró', () => {
    it('trata un 5xx como INDETERMINADO, no como rechazo', async () => {
      // Un 5xx no dice nada sobre si el cargo llegó a hacerse.
      responderCon(502, { error: 'Pasarela no disponible' });

      const respuesta = await pasarela.cobrar(solicitud);

      expect(respuesta.resultado).toBe(ResultadoCobro.INDETERMINADO);
      expect(respuesta.referencia).toBeNull();
    });

    it.each([
      ['timeout', Object.assign(new Error('The operation was aborted'), { name: 'TimeoutError' })],
      ['conexión rechazada', Object.assign(new Error('fetch failed'), { name: 'TypeError' })],
      ['DNS', Object.assign(new Error('getaddrinfo ENOTFOUND'), { name: 'Error' })],
    ])('trata un fallo de red (%s) como INDETERMINADO', async (_caso, error) => {
      fallarCon(error);

      const respuesta = await pasarela.cobrar(solicitud);

      expect(respuesta.resultado).toBe(ResultadoCobro.INDETERMINADO);
      expect(respuesta.motivo).toContain('No hubo respuesta');
    });

    it('nunca devuelve RECHAZADO cuando no hubo respuesta', async () => {
      // La invariante que sostiene todo: ante la duda, INDETERMINADO. Si esta
      // prueba falla, el sistema estaría afirmando que no se cobró sin saberlo.
      for (const error of [new Error('x'), new TypeError('y'), Object.assign(new Error('z'), { name: 'AbortError' })]) {
        fallarCon(error);
        const respuesta = await pasarela.cobrar(solicitud);
        expect(respuesta.resultado).not.toBe(ResultadoCobro.RECHAZADO);
      }
    });
  });

  it('corta la espera con el timeout configurado', async () => {
    const doble = responderCon(200, { estado: 'APROBADO', referencia: 'pas_abc' });

    await pasarela.cobrar(solicitud);

    // Sin `signal`, una pasarela muda dejaría la petición colgada y con ella el
    // bloqueo de Redis y una conexión del pool.
    const [, opciones] = doble.mock.calls[0] as [string, RequestInit];
    expect(opciones.signal).toBeDefined();
  });
});
