import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { ErrorCuenta } from '../core/auth.service';
import { PedidosService } from '../core/pedidos.service';
import { MenuEstablecimientoComponent } from './menu-establecimiento.component';

describe('Inicio del checkout de Pedidos', () => {
  let componente: MenuEstablecimientoComponent;
  let servicio: jasmine.SpyObj<PedidosService>;
  const producto = { id: 'producto', establecimientoId: 'local', nombre: 'Hamburguesa', descripcion: null,
    precio: '25000.00', activo: true, cantidadInventario: 20 };
  beforeEach(async () => {
    servicio = jasmine.createSpyObj('PedidosService', ['establecimientos', 'productos', 'crearCheckout', 'pagar']);
    servicio.establecimientos.and.resolveTo([{ id: 'local', eventoId: 'evento', nombre: 'Local', estado: 'DISPONIBLE', puntoEntrega: 'Módulo 4' }]);
    servicio.productos.and.resolveTo([producto]);
    TestBed.configureTestingModule({ providers: [
      { provide: PedidosService, useValue: servicio },
      { provide: ActivatedRoute, useValue: { snapshot: { params: { id: 'local' }, queryParamMap: convertToParamMap({ eventoId: 'evento' }) } } }
    ] });
    componente = TestBed.runInInjectionContext(() => new MenuEstablecimientoComponent());
    await Promise.resolve();
    await Promise.resolve();
    componente.cambiar(producto, 1);
    componente.metodoEntrega = 'Retiro';
  });

  it('consulta el catálogo real y muestra el checkout pendiente sin confirmar localmente', async () => {
    servicio.crearCheckout.and.resolveTo({ id: 'pedido', estado: 'PENDIENTE_PAGO', total: '25000.00',
      moneda: 'COP', establecimientoId: 'local', metodoEntrega: 'Retiro', creadoEn: '', expiraEn: '2026-12-12T12:10:00Z',
      inventarioReservado: true, codigoQr: null, detalles: [] });
    await componente.iniciarCheckout();
    expect(servicio.productos).toHaveBeenCalledWith('local');
    expect(componente.checkout()?.estado).toBe('PENDIENTE_PAGO');
    expect(componente.checkout()?.total).toBe('25000.00');
    expect(componente.unidades()).toBe(0);
    await componente.iniciarCheckout();
    expect(servicio.crearCheckout).toHaveBeenCalledTimes(1);
  });

  it('permite corregir cantidades ante rechazo de inventario del backend', async () => {
    servicio.crearCheckout.and.rejectWith(new ErrorCuenta('INVENTARIO_INSUFICIENTE', 'Inventario insuficiente', 409));
    await componente.iniciarCheckout();
    expect(componente.checkout()).toBeNull();
    expect(componente.unidades()).toBe(1);
    expect(componente.resultadoIncierto()).toBeFalse();
    expect(componente.error()).toContain('unidades');
  });

  it('no repite la creación después de un resultado incierto', async () => {
    servicio.crearCheckout.and.rejectWith(new ErrorCuenta('SIN_CONEXION', 'Sin conexión', 0));
    await componente.iniciarCheckout();
    await componente.iniciarCheckout();
    expect(componente.resultadoIncierto()).toBeTrue();
    expect(servicio.crearCheckout).toHaveBeenCalledTimes(1);
  });

  it('impide dos solicitudes simultáneas', async () => {
    let rechazar!: (error: unknown) => void;
    servicio.crearCheckout.and.returnValue(new Promise((_resolve, reject) => { rechazar = reject; }));
    const primera = componente.iniciarCheckout();
    await componente.iniciarCheckout();
    expect(servicio.crearCheckout).toHaveBeenCalledTimes(1);
    rechazar(new Error('Sin respuesta'));
    await primera;
  });
  function checkoutParaPago(): void {
    componente.checkout.set({ id: 'pedido', estado: 'PENDIENTE_PAGO', total: '25000.00',
      moneda: 'COP', establecimientoId: 'local', metodoEntrega: 'Retiro', creadoEn: '', expiraEn: '',
      inventarioReservado: true, codigoQr: null, detalles: [] });
  }
  const aprobado = { pedidoId: 'pedido', transaccionId: 'intento', estadoPago: 'APROBADA' as const,
    estadoPedido: 'CONFIRMADO', monto: '25000.00', moneda: 'COP', referenciaPasarela: 'referencia',
    codigo: 'PAGO_APROBADA', compraConfirmada: true, codigoQr: 'codigo-del-backend' };

  it('confirma con el resultado del backend y no vuelve a cobrar tras confirmar', async () => {
    checkoutParaPago();
    servicio.pagar.and.resolveTo(aprobado);
    await componente.pagar();
    expect(componente.pago()).toEqual(aprobado);
    expect(servicio.pagar.calls.first().args[1]).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    await componente.pagar();
    expect(servicio.pagar).toHaveBeenCalledTimes(1);
  });

  it('reutiliza exactamente la clave después de perder la respuesta', async () => {
    checkoutParaPago();
    servicio.pagar.and.rejectWith(new ErrorCuenta('SIN_CONEXION', 'Sin conexión', 0));
    await componente.pagar();
    servicio.pagar.and.resolveTo(aprobado);
    await componente.pagar();
    expect(servicio.pagar.calls.argsFor(0)[1]).toBe(servicio.pagar.calls.argsFor(1)[1]);
  });

  it('solo un rechazo definitivo permite otra clave', async () => {
    checkoutParaPago();
    servicio.pagar.and.resolveTo({ ...aprobado, estadoPago: 'RECHAZADA', estadoPedido: 'PENDIENTE_PAGO', compraConfirmada: false, codigoQr: null });
    await componente.pagar();
    expect(componente.mensajePago()).toContain('rechazado');
    servicio.pagar.and.resolveTo(aprobado);
    await componente.pagar();
    expect(servicio.pagar.calls.argsFor(0)[1]).not.toBe(servicio.pagar.calls.argsFor(1)[1]);
  });

  it('conserva la clave de resultados inciertos y bloquea clics mientras paga', async () => {
    checkoutParaPago();
    let resolver!: (resultado: any) => void;
    servicio.pagar.and.returnValue(new Promise((resolve) => { resolver = resolve; }));
    const primera = componente.pagar();
    await componente.pagar();
    expect(servicio.pagar).toHaveBeenCalledTimes(1);
    resolver({ ...aprobado, estadoPago: 'FALLIDA', compraConfirmada: false, codigoQr: null });
    await primera;
    servicio.pagar.and.resolveTo(aprobado);
    await componente.pagar();
    expect(servicio.pagar.calls.argsFor(0)[1]).toBe(servicio.pagar.calls.argsFor(1)[1]);
  });

  it('ofrece recogida con una etiqueta amigable y envía RECOGER al backend', async () => {
    const nueva = TestBed.runInInjectionContext(() => new MenuEstablecimientoComponent());
    expect(nueva.metodoEntrega).toBe('RECOGER');
    nueva.cambiar(producto, 1);
    servicio.crearCheckout.and.rejectWith(new ErrorCuenta('INVENTARIO_INSUFICIENTE', '', 409));
    await nueva.iniciarCheckout();
    expect(servicio.crearCheckout.calls.mostRecent().args[0].metodoEntrega).toBe('RECOGER');
  });

});
