import { TestBed } from '@angular/core/testing';
import { HttpHeaders, provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { firstValueFrom } from 'rxjs';
import { AuthService } from './auth.service';
import { CrearCheckout, PedidosService } from './pedidos.service';
import { Servidor } from './servidor';

describe('PedidosService HTTP', () => {
  let servicio: PedidosService;
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), {
      provide: AuthService, useValue: { conAcceso: (peticion: any) => firstValueFrom(peticion(new HttpHeaders({ Authorization: 'Bearer prueba' }))) }
    }] });
    servicio = TestBed.inject(PedidosService);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('consulta establecimientos del evento usando el gateway y la sesión existente', async () => {
    const respuesta = servicio.establecimientos('evento');
    const peticion = http.expectOne(`${Servidor.api}/pedidos/eventos/evento/establecimientos`);
    expect(peticion.request.headers.get('Authorization')).toBe('Bearer prueba');
    peticion.flush([]);
    expect(await respuesta).toEqual([]);
  });

  it('conserva precios decimales e inventario cero del catálogo', async () => {
    const respuesta = servicio.productos('local');
    const producto = { id: 'producto', precio: '7000.00', cantidadInventario: 0 };
    http.expectOne(`${Servidor.api}/pedidos/establecimientos/local/productos`).flush([producto]);
    expect((await respuesta)[0].cantidadInventario).toBe(0);
  });

  it('envía únicamente el contrato de checkout y conserva el resumen del servidor', async () => {
    const respuesta = servicio.crearCheckout({ eventoId: 'evento', establecimientoId: 'local', metodoEntrega: ' Retiro ',
      productos: [{ productoId: 'producto', cantidad: 2, precio: '1' }], clienteId: 'falso', total: '2' } as unknown as CrearCheckout);
    const peticion = http.expectOne(`${Servidor.api}/pedidos/checkout`);
    expect(peticion.request.method).toBe('POST');
    expect(peticion.request.body).toEqual({ eventoId: 'evento', establecimientoId: 'local', metodoEntrega: 'Retiro',
      productos: [{ productoId: 'producto', cantidad: 2 }] });
    const resultado = { id: 'pedido', total: '50000.00', estado: 'PENDIENTE_PAGO', inventarioReservado: true };
    peticion.flush(resultado);
    expect(await respuesta).toEqual(jasmine.objectContaining(resultado));
  });
  it('paga por gateway con UUID y token demo, sin enviar precios ni identidad', async () => {
    const clave = 'a0000000-0000-4000-8000-000000000001';
    const resultado = servicio.pagar('pedido', clave);
    const peticion = http.expectOne(`${Servidor.api}/pedidos/pedido/pagos`);
    expect(peticion.request.headers.get('Idempotency-Key')).toBe(clave);
    expect(peticion.request.headers.get('Authorization')).toBe('Bearer prueba');
    expect(peticion.request.body).toEqual({ tokenPago: 'tok_ok_pedidos_web' });
    peticion.flush({ compraConfirmada: true, codigoQr: 'qr-real' });
    expect((await resultado).codigoQr).toBe('qr-real');
  });

  it('conserva el resultado FALLIDA enviado con HTTP 504', async () => {
    const clave = 'a0000000-0000-4000-8000-000000000001';
    const resultado = servicio.pagar('pedido', clave);
    http.expectOne(`${Servidor.api}/pedidos/pedido/pagos`).flush({ pedidoId: 'pedido', transaccionId: clave,
      estadoPago: 'FALLIDA', codigo: 'PASARELA_TIMEOUT', compraConfirmada: false }, { status: 504, statusText: 'Timeout' });
    expect((await resultado).estadoPago).toBe('FALLIDA');
  });

});
