import { ComponentFixture, fakeAsync, flushMicrotasks, TestBed } from '@angular/core/testing';
import { CancelacionPedidoComponent } from './cancelacion-pedido.component';
import { PreparacionApiService, PedidoRecibido, CancelacionPedido } from '../core/preparacion-api.service';
import { AuthService, ErrorCuenta } from '../core/auth.service';

const pedido: PedidoRecibido = { id: 'pedido', estado: 'CONFIRMADO', total: '1000.25', moneda: 'COP', pagoVerificado: true,
  confirmadoEn: null, productos: [], preparacion: { estado: 'RECIBIDO', version: 0, iniciadoEn: null, estimadoListoEn: null, listoEn: null, incidenciasAbiertas: 0, retrasado: false } };
const cancelacion: CancelacionPedido = { pedidoId: 'pedido', operacionId: 'op', motivo: 'No podemos preparar', canceladoEn: '2026-11-11T22:00:00Z', inventario: 'RESTITUIDO',
  reembolso: { estado: 'APROBADO', monto: '1000.25', moneda: 'COP', referencia: 'ree_confirmada', resueltoEn: '2026-11-11T22:00:01Z' } };
describe('Cancelación explícita y recuperación de intención', () => {
  let fixture: ComponentFixture<CancelacionPedidoComponent>;
  let api: { cancelar: jasmine.Spy; cancelacion: jasmine.Spy };
  const clave = 'hexacore.cu011f.intencion.actor-cancelacion-unit';
  function crear(p = pedido) {
    fixture = TestBed.createComponent(CancelacionPedidoComponent);
    fixture.componentRef.setInput('local', 'local'); fixture.componentRef.setInput('pedido', p); fixture.detectChanges();
    return fixture.componentInstance;
  }
  beforeEach(() => {
    localStorage.removeItem(clave);
    api = { cancelar: jasmine.createSpy().and.resolveTo(cancelacion), cancelacion: jasmine.createSpy().and.resolveTo(cancelacion) };
    TestBed.configureTestingModule({ imports: [CancelacionPedidoComponent], providers: [
      { provide: PreparacionApiService, useValue: api }, { provide: AuthService, useValue: { usuarioActual: () => ({ id: 'actor-cancelacion-unit' }) } } ] });
  });
  afterEach(() => { fixture?.destroy(); localStorage.removeItem(clave); });
  it('exige confirmación y guarda versión revisada sin campos financieros del navegador', fakeAsync(() => {
    const c = crear(); c.abrir(); c.motivo = 'No podemos preparar'; void c.guardar(); flushMicrotasks();
    expect(api.cancelar).not.toHaveBeenCalled();
    fixture.componentRef.setInput('pedido', { ...pedido, preparacion: { ...pedido.preparacion, version: 2 } }); fixture.detectChanges();
    c.confirmar = true; void c.guardar(); flushMicrotasks();
    const i = api.cancelar.calls.mostRecent().args[0];
    expect(i.datos).toEqual({ version: 0, motivo: 'No podemos preparar', confirmar: true });
    expect(i.id).toMatch(/^[a-f0-9-]{36}$/); expect(localStorage.getItem(clave)).toBeNull();
  }));
  it('respuesta perdida y nueva instancia conservan la misma operación y datos', fakeAsync(() => {
    let c = crear(); c.abrir(); c.motivo = 'No podemos preparar'; c.confirmar = true;
    api.cancelar.and.rejectWith(new ErrorCuenta('SIN_CONEXION', 'Respuesta perdida', 0));
    void c.guardar(); flushMicrotasks(); const i = c.pendiente()!;
    expect(JSON.parse(localStorage.getItem(clave)!)).toEqual(i);
    fixture.destroy(); c = crear(); expect(c.pendiente()).toEqual(i);
    api.cancelar.and.resolveTo(cancelacion); void c.recuperar(); flushMicrotasks();
    expect(api.cancelar.calls.mostRecent().args[0]).toEqual(i); expect(c.pendiente()).toBeNull();
  }));
  it('no reutiliza el formulario al seleccionar otro pedido', fakeAsync(() => {
    const c = crear(); c.abrir(); c.motivo = 'No podemos preparar'; c.confirmar = true;
    fixture.componentRef.setInput('pedido', { ...pedido, id: 'otro' }); fixture.detectChanges();
    void c.guardar(); flushMicrotasks(); expect(api.cancelar).not.toHaveBeenCalled(); expect(c.formulario).toBeFalse();
  }));
  for (const estado of ['PENDIENTE', 'RECHAZADO', 'INCIERTO'] as const) {
    it(`muestra ${estado} sin afirmar devolución confirmada`, () => {
      crear({ ...pedido, estado: 'CANCELADO', cancelacion: { ...cancelacion, reembolso: { ...cancelacion.reembolso, estado, referencia: null, resueltoEn: null } } });
      const texto = fixture.nativeElement.textContent;
      expect(texto).toContain(estado.toLowerCase()); expect(texto).toContain('no se confirma dinero devuelto');
      expect(texto).not.toContain('La pasarela confirmó la aprobación');
    });
  }
});
