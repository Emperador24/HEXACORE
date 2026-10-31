import { Logger } from '@nestjs/common';
import { ConfiguracionServicio } from '../config/configuracion';
import { ClienteVentas, MotivoNoRevendible } from './cliente-ventas.service';

/**
 * El cliente de la API interna de Ventas.
 *
 * Parece un envoltorio de `fetch`, pero toma una decisión de la que depende
 * toda la Saga del checkout: **distinguir "Ventas dijo que no" de "Ventas no
 * dijo nada"**. Lo primero permite compensar; lo segundo no permite concluir
 * nada. Si esa distinción se pierde aquí, el checkout reabriría publicaciones
 * que quizá sí se transfirieron y acabaría vendiendo una entrada dos veces.
 *
 * Por eso se prueba contra un `fetch` doblado y no solo a través del servicio.
 */
describe('ClienteVentas', () => {
  const TOKEN = 'token-de-sesion';
  const ENTRADA = '20000000-0000-4000-8000-000000000001';

  const config = {
    ventas: { url: 'http://ventas:3001/api/v1/', timeoutMs: 1000 },
    tokenServicios: 'secreto-compartido',
  } as ConfiguracionServicio;

  let fetchDoble: jest.Mock;

  beforeEach(() => {
    fetchDoble = jest.fn();
    global.fetch = fetchDoble as unknown as typeof fetch;
  });

  afterEach(() => jest.restoreAllMocks());

  /** Respuesta correcta con el cuerpo dado. */
  function responde(cuerpo: unknown) {
    fetchDoble.mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve(JSON.stringify(cuerpo)),
    });
  }

  function cliente() {
    return new ClienteVentas(config);
  }

  /** Lo que se le pasó a `fetch` en la última llamada. */
  function ultimaLlamada(): [string, RequestInit] {
    return fetchDoble.mock.calls[fetchDoble.mock.calls.length - 1] as [string, RequestInit];
  }

  it('no duplica la barra de la URL configurada', async () => {
    // La URL del entorno puede venir con barra final o sin ella. Una doble
    // barra daría un 404 que parecería "Ventas no responde".
    responde({ devuelta: true });

    await cliente().devolverDeReventa(ENTRADA, TOKEN);

    expect(ultimaLlamada()[0]).toBe('http://ventas:3001/api/v1/interno/entradas/devolver-de-reventa');
  });

  describe('cómo se identifica', () => {
    it('reenvía el token del usuario cuando hay usuario', async () => {
      responde({ devuelta: true });

      await cliente().devolverDeReventa(ENTRADA, TOKEN);

      const cabeceras = ultimaLlamada()[1].headers as Record<string, string>;
      expect(cabeceras.Authorization).toBe(`Bearer ${TOKEN}`);
      expect(cabeceras['X-Token-Servicio']).toBeUndefined();
    });

    it('usa el credencial de servicio cuando no hay usuario', async () => {
      // El trabajo de expiración (CU-006D) corre por reloj: no hay token que
      // reenviar. Inventar un usuario de sistema ensuciaría la auditoría.
      responde({ devuelta: true });
      const c = cliente();

      await c.devolverDeReventa(ENTRADA, c.comoServicio());

      const cabeceras = ultimaLlamada()[1].headers as Record<string, string>;
      expect(cabeceras['X-Token-Servicio']).toBe('secreto-compartido');
      expect(cabeceras.Authorization).toBeUndefined();
    });
  });

  describe('consultar no es escribir', () => {
    it('pide las entradas con GET y sin cuerpo', async () => {
      // Un GET deja que reintentar la consulta sea gratis.
      responde({ entradas: [] });

      await cliente().entradasDe('a-1', TOKEN);

      const [url, opciones] = ultimaLlamada();
      expect(url).toContain('/interno/entradas/de/a-1');
      expect(opciones.method).toBe('GET');
      expect(opciones.body).toBeUndefined();
    });

    it('marca en reventa con POST y cuerpo', async () => {
      responde({ entradaId: ENTRADA, eventoId: 'e-1', numeroTicket: 'T', localidadNombre: 'L', precioOriginal: 1 });

      await cliente().marcarEnReventa(ENTRADA, 'a-1', TOKEN);

      const [, opciones] = ultimaLlamada();
      expect(opciones.method).toBe('POST');
      expect(JSON.parse(opciones.body as string)).toEqual({ entradaId: ENTRADA, propietarioId: 'a-1' });
    });
  });

  describe('entradasDe', () => {
    it('devuelve la lista cuando Ventas responde', async () => {
      responde({ entradas: [{ entradaId: ENTRADA }] });

      await expect(cliente().entradasDe('a-1', TOKEN)).resolves.toHaveLength(1);
    });

    it('devuelve null —no una lista vacía— si Ventas no responde', async () => {
      // "No tienes entradas" y "no pude preguntarlo" no son lo mismo: confundirlos
      // haría que alguien creyera que perdió su entrada.
      fetchDoble.mockRejectedValue(new Error('ECONNREFUSED'));

      await expect(cliente().entradasDe('a-1', TOKEN)).resolves.toBeNull();
    });

    it('devuelve null si el cuerpo no trae una lista', async () => {
      responde({ entradas: 'ninguna' });

      await expect(cliente().entradasDe('a-1', TOKEN)).resolves.toBeNull();
    });
  });

  describe('marcarEnReventa', () => {
    it('devuelve la copia que hay que guardar en la publicación', async () => {
      responde({
        entradaId: ENTRADA,
        eventoId: 'e-1',
        numeroTicket: 'TCK-2026-000001',
        localidadNombre: 'General',
        precioOriginal: 250000,
      });

      await expect(cliente().marcarEnReventa(ENTRADA, 'a-1', TOKEN)).resolves.toMatchObject({
        marcada: true,
        entrada: { numeroTicket: 'TCK-2026-000001', localidadNombre: 'General' },
      });
    });

    it('distingue "no es tuya" de "no está disponible"', async () => {
      // El CU-006 tiene un camino para cada una: la pre-condición 1 es un 403 y
      // CU-006E un 409. Colapsarlas dejaría al vendedor sin saber cuál le toca.
      fetchDoble.mockResolvedValue({
        ok: false,
        status: 403,
        text: () => Promise.resolve(JSON.stringify({ codigo: 'NO_ES_PROPIETARIO' })),
      });

      await expect(cliente().marcarEnReventa(ENTRADA, 'a-1', TOKEN)).resolves.toEqual({
        marcada: false,
        motivo: MotivoNoRevendible.NO_ES_SUYA,
        estado: undefined,
      });
    });

    it('reconoce la entrada que no existe', async () => {
      fetchDoble.mockResolvedValue({
        ok: false,
        status: 404,
        text: () => Promise.resolve(JSON.stringify({ codigo: 'ENTRADA_NO_ENCONTRADA' })),
      });

      await expect(cliente().marcarEnReventa(ENTRADA, 'a-1', TOKEN)).resolves.toMatchObject({
        motivo: MotivoNoRevendible.NO_EXISTE,
      });
    });

    it('conserva el estado que impide revender, para poder nombrarlo', async () => {
      fetchDoble.mockResolvedValue({
        ok: false,
        status: 409,
        text: () => Promise.resolve(JSON.stringify({ codigo: 'ENTRADA_NO_REVENDIBLE', estado: 'USADA' })),
      });

      await expect(cliente().marcarEnReventa(ENTRADA, 'a-1', TOKEN)).resolves.toMatchObject({
        motivo: MotivoNoRevendible.ESTADO,
        estado: 'USADA',
      });
    });

    it('SIN_RESPUESTA cuando Ventas no contesta: no es una negativa', async () => {
      fetchDoble.mockRejectedValue(new Error('ECONNREFUSED'));

      await expect(cliente().marcarEnReventa(ENTRADA, 'a-1', TOKEN)).resolves.toMatchObject({
        motivo: MotivoNoRevendible.SIN_RESPUESTA,
      });
    });
  });

  describe('transferir — la distinción de la que cuelga la Saga', () => {
    const datos = {
      entradaId: ENTRADA,
      compradorId: 'b-1',
      vendedorId: 'a-1',
      transaccionId: 't-1',
      codigoQrNuevo: 'HXC-QR-nuevo',
    };

    it('transferida cuando Ventas lo confirma', async () => {
      responde({ transferida: true, qrAnterior: 'HXC-QR-viejo' });

      await expect(cliente().transferir(datos, TOKEN)).resolves.toEqual({
        transferida: true,
        qrAnterior: 'HXC-QR-viejo',
        respondio: true,
      });
    });

    it('no transferida PERO respondió cuando Ventas dice que no', async () => {
      // Se puede compensar: no transfirió nada, así que reabrir es seguro.
      responde({ transferida: false, qrAnterior: null });

      await expect(cliente().transferir(datos, TOKEN)).resolves.toMatchObject({
        transferida: false,
        respondio: true,
      });
    });

    it('no respondió cuando la llamada falla', async () => {
      // No se puede concluir nada. Quien llama tiene que tratarlo como
      // cobrado-sin-saber y NO reabrir la publicación.
      fetchDoble.mockRejectedValue(new Error('timeout'));

      await expect(cliente().transferir(datos, TOKEN)).resolves.toEqual({
        transferida: false,
        qrAnterior: null,
        respondio: false,
      });
    });

    it('no respondió cuando Ventas devuelve un error HTTP', async () => {
      // Un 500 tampoco permite concluir: puede haber transferido y haber
      // fallado al responder.
      fetchDoble.mockResolvedValue({ ok: false, status: 500, text: () => Promise.resolve('') });

      await expect(cliente().transferir(datos, TOKEN)).resolves.toMatchObject({ respondio: false });
    });
  });

  describe('devolverDeReventa', () => {
    it('true cuando Ventas la devuelve', async () => {
      responde({ devuelta: true });

      await expect(cliente().devolverDeReventa(ENTRADA, TOKEN)).resolves.toBe(true);
    });

    it('false y deja constancia cuando no se consigue', async () => {
      // La entrada queda bloqueada EN_REVENTA sin publicación: recuperable,
      // pero nadie se enteraría si esto pasara en silencio.
      const error = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      fetchDoble.mockRejectedValue(new Error('ECONNREFUSED'));

      await expect(cliente().devolverDeReventa(ENTRADA, TOKEN)).resolves.toBe(false);
      expect(error).toHaveBeenCalledWith(expect.stringContaining(ENTRADA));
    });
  });
});
