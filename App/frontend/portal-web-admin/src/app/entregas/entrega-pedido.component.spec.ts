import { ComponentFixture, fakeAsync, flushMicrotasks, TestBed } from '@angular/core/testing';
import { provideNoopAnimations } from '@angular/platform-browser/animations';
import { AuthService, ErrorCuenta } from '../core/auth.service';
import { EntregasApiService } from '../core/entregas-api.service';
import { EntregaPedidoComponent } from './entrega-pedido.component';
const qr='a'.repeat(64);
const revision={pedidoId:'pedido',version:2,puntoRevision:'b'.repeat(64),puntoEntrega:'Puerta uno',total:'1000.25',moneda:'COP',productos:[{nombreProducto:'Receta histórica',cantidad:1,precioUnitario:'1000.25'}]};
describe('Revisar y confirmar entrega',()=>{
  let fixture:ComponentFixture<EntregaPedidoComponent>;let api:{prevalidar:jasmine.Spy;confirmar:jasmine.Spy};
  const clave='hexacore.cu014.intencion.personal-entrega';
  beforeEach(()=>{
    localStorage.removeItem(clave);api={prevalidar:jasmine.createSpy().and.resolveTo(revision),confirmar:jasmine.createSpy().and.resolveTo({id:'op',pedidoId:'pedido',estadoOperativo:'ENTREGADO',entrega:{puntoEntrega:'Puerta uno',entregadoEn:'2026-11-08T05:00:00Z'}})};
    TestBed.configureTestingModule({imports:[EntregaPedidoComponent],providers:[provideNoopAnimations(),{provide:EntregasApiService,useValue:api},{provide:AuthService,useValue:{usuarioActual:()=>({id:'personal-entrega'})}}]});
    fixture=TestBed.createComponent(EntregaPedidoComponent);fixture.componentRef.setInput('local','local');fixture.detectChanges();
  });
  it('consultar no entrega; exige revisar el resultado del servidor antes de confirmar',fakeAsync(()=>{
    const c=fixture.componentInstance;c.codigo=qr;void c.validar();flushMicrotasks();fixture.detectChanges();
    expect(api.prevalidar).toHaveBeenCalledWith('local',qr);expect(api.confirmar).not.toHaveBeenCalled();expect(fixture.nativeElement.textContent).toContain('Punto autorizado: Puerta uno');
    void c.confirmar();flushMicrotasks();fixture.detectChanges();expect(api.confirmar).toHaveBeenCalledTimes(1);expect(c.resultado()?.estadoOperativo).toBe('ENTREGADO');expect(c.codigo).toBe('');expect(localStorage.getItem(clave)).toBeNull();fixture.destroy();
  }));
  it('conserva UUID sin secreto ante respuesta perdida y recupera sin poder originar otra entrega',fakeAsync(()=>{
    const c=fixture.componentInstance;c.codigo=qr;void c.validar();flushMicrotasks();api.confirmar.and.rejectWith(new ErrorCuenta('SIN_CONEXION','Sin respuesta',0));
    void c.confirmar();flushMicrotasks();const i=c.pendiente()!;expect(localStorage.getItem(clave)).toContain(i.id);expect(localStorage.getItem(clave)).not.toContain(qr);expect(c.codigo).toBe('');fixture.destroy();
    fixture=TestBed.createComponent(EntregaPedidoComponent);fixture.componentRef.setInput('local','local');fixture.detectChanges();
    api.confirmar.and.resolveTo({id:i.id,pedidoId:'pedido',estadoOperativo:'ENTREGADO',entrega:{puntoEntrega:'Puerta uno',entregadoEn:'2026-11-08T05:00:00Z'}});
    void fixture.componentInstance.recuperar();flushMicrotasks();expect(api.confirmar.calls.mostRecent().args).toEqual([i,undefined]);expect(localStorage.getItem(clave)).toBeNull();fixture.destroy();
  }));
  it('si nunca se confirmó, requiere código otra vez y conserva la operación original',fakeAsync(()=>{
    const c=fixture.componentInstance;c.codigo=qr;void c.validar();flushMicrotasks();api.confirmar.and.rejectWith(new ErrorCuenta('QR_REQUERIDO','Presenta otra vez el código',400));
    void c.confirmar();flushMicrotasks();expect(c.pendiente()).not.toBeNull();expect(c.revision()).toBeNull();expect(c.error()).toContain('Presenta');fixture.destroy();
  }));
});
