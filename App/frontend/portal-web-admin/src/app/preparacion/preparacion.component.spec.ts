import { ComponentFixture, fakeAsync, flushMicrotasks, TestBed, tick } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { PreparacionComponent } from './preparacion.component';
import { PreparacionApiService } from '../core/preparacion-api.service';
import { MenuApiService } from '../core/menu-api.service';
import { AuthService, ErrorCuenta } from '../core/auth.service';

const pedido = { id: 'p', estado: 'CONFIRMADO', total: '1000.25', moneda: 'COP', pagoVerificado: true, confirmadoEn: null,
  productos: [{ productoId: 'producto', nombreProducto: 'Receta acordada', cantidad: 1, precioUnitario: '1000.25' }],
  preparacion: { estado: 'RECIBIDO', version: 0, iniciadoEn: null, estimadoListoEn: null, listoEn: null, incidenciasAbiertas: 0, retrasado: false } };
describe('Bandeja de preparación', () => {
  let fixture: ComponentFixture<PreparacionComponent>;
  let api: { listar: jasmine.Spy; detalle: jasmine.Spy; operar: jasmine.Spy };
  beforeEach(() => {
    localStorage.removeItem('hexacore.cu013.intencion.personal-unit');
    spyOnProperty(document, 'visibilityState', 'get').and.returnValue('visible');
    api = { listar: jasmine.createSpy().and.resolveTo([pedido]), detalle: jasmine.createSpy().and.resolveTo(pedido), operar: jasmine.createSpy().and.resolveTo({ id: 'op' }) };
    TestBed.configureTestingModule({ imports: [PreparacionComponent], providers: [provideNoopAnimations(),
      { provide: PreparacionApiService, useValue: api }, { provide: MenuApiService, useValue: { misEstablecimientos: () => Promise.resolve([{ id: 'l', nombre: 'Local cerrado', estado: 'CERRADO' }]) } },
      { provide: AuthService, useValue: { usuarioActual: () => ({ id: 'personal-unit' }) } } ] });
  });
  it('consulta el vínculo privado cerrado y termina el sondeo al destruir la pantalla', fakeAsync(() => {
    fixture = TestBed.createComponent(PreparacionComponent); fixture.detectChanges(); flushMicrotasks(); fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Local cerrado'); expect(api.listar).toHaveBeenCalledWith('l');
    tick(15000); flushMicrotasks(); expect(api.listar).toHaveBeenCalledTimes(2);
    fixture.destroy(); tick(45000); expect(api.listar).toHaveBeenCalledTimes(2);
  }));
  it('el formulario conserva su versión y 409 pide actualizar, sin reenviar otra operación', fakeAsync(() => {
    fixture = TestBed.createComponent(PreparacionComponent); flushMicrotasks();
    const c = fixture.componentInstance; c.seleccionado.set(pedido); c.abrir('INICIAR');
    c.seleccionado.set({ ...pedido, preparacion: { ...pedido.preparacion, version: 3 } });
    api.operar.and.rejectWith(new ErrorCuenta('VERSION_PREPARACION_DESACTUALIZADA', 'El pedido cambió.', 409));
    c.minutos = 12; void c.guardar(); flushMicrotasks();
    expect(api.operar.calls.mostRecent().args[0].datos).toEqual({ accion: 'INICIAR', version: 0, minutos: 12 });
    expect(c.error()).toContain('El pedido cambió'); expect(c.pendiente()).toBeNull();
    expect(api.operar).toHaveBeenCalledTimes(1); fixture.destroy();
  }));
  it('un error incierto conserva UUID/petición y pausa el sondeo hasta una repetición explícita', fakeAsync(() => {
    fixture = TestBed.createComponent(PreparacionComponent); flushMicrotasks(); const c = fixture.componentInstance;
    c.seleccionado.set(pedido); c.abrir('INICIAR'); api.operar.and.rejectWith(new ErrorCuenta('SIN_CONEXION', 'Sin respuesta', 0));
    void c.guardar(); flushMicrotasks(); const i = c.pendiente(); expect(i).not.toBeNull();
    expect(localStorage.getItem('hexacore.cu013.intencion.personal-unit')).toContain(i!.id);
    tick(45000); expect(api.listar).toHaveBeenCalledTimes(1);
    api.operar.and.resolveTo({ id: i!.id }); void c.repetir(); flushMicrotasks();
    expect(api.operar.calls.mostRecent().args[0]).toEqual(i); expect(c.pendiente()).toBeNull(); fixture.destroy();
  }));
});
