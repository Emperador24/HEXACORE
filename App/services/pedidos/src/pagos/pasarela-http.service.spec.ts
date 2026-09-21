import { createServer, Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { ConfiguracionServicio } from '../config/configuracion';
import { PasarelaHttp } from './pasarela-http.service';
import { EstadoTransaccionPedido as Estado } from '../persistencia/entidades/transaccion-pedido.entity';

const id = '60000000-0000-4000-8000-000000000001';
const respuesta = { estado: 'APROBADO', referencia: `pas_${id}`, monto: 25000, moneda: 'COP' };
const config = { pasarelaPagos: { url: 'http://localhost:3099', timeoutMs: 1000 } } as ConfiguracionServicio;

describe('PasarelaHttp', () => {
  let fetchMock: jest.SpyInstance;
  let servicio: PasarelaHttp;
  beforeEach(() => {
    fetchMock = jest.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(respuesta)));
    servicio = new PasarelaHttp(config);
  });
  afterEach(() => jest.restoreAllMocks());
  it('envía solo el contrato de cobro y su clave; no expone el token en el resultado', async () => {
    const resultado = await servicio.cobrar(id, '25000.00', 'COP', 'tok_secreto');
    const [url, opciones] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:3099/pagos');
    expect(opciones.headers['Idempotency-Key']).toBe(id);
    expect(JSON.parse(opciones.body)).toEqual({ monto: 25000, moneda: 'COP', token: 'tok_secreto' });
    expect(resultado).toEqual({ estado: Estado.APROBADA, referenciaPasarela: respuesta.referencia, motivo: null });
  });
  it('registra rechazo con motivo controlado, no el texto sensible del proveedor', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ ...respuesta, estado: 'RECHAZADO', motivo: 'tok_secreto PAN 123' })));
    expect(await servicio.cobrar(id, '25000.00', 'COP', 'tok_secreto')).toEqual({ estado: Estado.RECHAZADA, referenciaPasarela: respuesta.referencia, motivo: 'PAGO_RECHAZADO' });
  });
  it.each([400, 429, 500, 502])('HTTP %s no significa rechazo financiero', async (status) => {
    fetchMock.mockResolvedValue(new Response('PAN CVV tok_secreto', { status }));
    expect(await servicio.cobrar(id, '25000.00', 'COP', 'tok_secreto')).toEqual({ estado: Estado.FALLIDA, referenciaPasarela: null, motivo: 'PASARELA_ERROR_HTTP' });
  });
  it.each([null, {}, { ...respuesta, referencia: 'tok_secreto' }, { ...respuesta, monto: 1 }, { ...respuesta, moneda: 'USD' }, { ...respuesta, estado: 'OTRO' }])('falla prudentemente ante respuesta inválida', async (body) => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify(body)));
    expect((await servicio.cobrar(id, '25000.00', 'COP', 'tok_secreto')).estado).toBe(Estado.FALLIDA);
  });
  it('no propaga errores crudos ni JSON ilegible', async () => {
    fetchMock.mockResolvedValueOnce(new Response('tok_secreto'));
    expect((await servicio.cobrar(id, '25000.00', 'COP', 'tok_secreto')).motivo).toBe('PASARELA_ERROR_TECNICO');
    fetchMock.mockRejectedValueOnce(new Error('tok_secreto'));
    expect((await servicio.cobrar(id, '25000.00', 'COP', 'tok_secreto')).motivo).toBe('PASARELA_ERROR_TECNICO');
  });
});

describe('PasarelaHttp con HTTP local real', () => {
  let servidor: Server;
  let url: string;
  beforeEach(async () => {
    servidor = createServer((_req, _res) => { /* Simula tok_timeout: no responde. */ });
    await new Promise<void>((resolve, reject) => {
      servidor.once('error', reject);
      servidor.listen(0, '127.0.0.1', resolve);
    });
    url = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}`;
  });
  afterEach(async () => {
    if (!servidor.listening) return;
    servidor.closeAllConnections();
    await new Promise<void>((resolve, reject) => servidor.close((error) => error ? reject(error) : resolve()));
  });
  it('aborta la espera y registra timeout sin guardar el token', async () => {
    const servicio = new PasarelaHttp({ pasarelaPagos: { url, timeoutMs: 30 } } as ConfiguracionServicio);
    expect(await servicio.cobrar(id, '25000.00', 'COP', 'tok_timeout')).toEqual({ estado: Estado.FALLIDA, referenciaPasarela: null, motivo: 'PASARELA_TIMEOUT' });
  });
});
