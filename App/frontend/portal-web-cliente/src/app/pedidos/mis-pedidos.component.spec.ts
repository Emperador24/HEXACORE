import { Component, Input } from '@angular/core';
import { ComponentFixture, fakeAsync, flushMicrotasks, TestBed, tick } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { By } from '@angular/platform-browser';
import { MisPedidosComponent } from './mis-pedidos.component';
import { QrPedidoComponent } from './qr-pedido.component';
import { PedidosService } from '../core/pedidos.service';
@Component({selector:'app-qr-pedido',standalone:true,template:''})
class QrPrueba { @Input() codigo = ''; }
const pedido = { id: 'p', estado: 'CONFIRMADO', total: '1000.25', moneda: 'COP', establecimiento: 'Local cerrado', puntoEntrega: 'Puerta', creadoEn:'2026-11-07T12:00:00Z', confirmadoEn:null,
  codigoQr:'qr-persistido',pagoVerificado:true,productos:[],avisos:[{id:'op',mensaje:'Tu pedido está en preparación.',creadoEn:'2026-11-07T12:00:00Z'}],
  preparacion:{estado:'EN_PREPARACION',version:1,iniciadoEn:null,estimadoListoEn:'2026-11-07T12:10:00Z',listoEn:null,retrasado:false,incidenciasAbiertas:0}};
describe('Seguimiento propio persistido',()=>{
  let fixture:ComponentFixture<MisPedidosComponent>;let api:{misPedidos:jasmine.Spy;seguimiento:jasmine.Spy};
  beforeEach(()=>{
    spyOnProperty(document,'visibilityState','get').and.returnValue('visible');
    api={misPedidos:jasmine.createSpy().and.resolveTo([pedido]),seguimiento:jasmine.createSpy().and.resolveTo(pedido)};
    TestBed.configureTestingModule({imports:[MisPedidosComponent],providers:[provideRouter([]),
      {provide:ActivatedRoute,useValue:{paramMap:of(convertToParamMap({pedidoId:'p'}))}}, {provide:PedidosService,useValue:api}]});
    TestBed.overrideComponent(MisPedidosComponent,{remove:{imports:[QrPedidoComponent]},add:{imports:[QrPrueba]}});
  });
  it('recupera detalle, aviso y mismo QR desde su cuenta tras una nueva instancia',fakeAsync(()=>{
    fixture=TestBed.createComponent(MisPedidosComponent);fixture.detectChanges();flushMicrotasks();fixture.detectChanges();
    expect(api.seguimiento).toHaveBeenCalledWith('p');expect(fixture.nativeElement.textContent).toContain('Tu pedido está en preparación.');
    expect(fixture.debugElement.query(By.directive(QrPrueba)).componentInstance.codigo).toBe('qr-persistido');
    fixture.destroy();fixture=TestBed.createComponent(MisPedidosComponent);fixture.detectChanges();flushMicrotasks();fixture.detectChanges();
    expect(fixture.debugElement.query(By.directive(QrPrueba)).componentInstance.codigo).toBe('qr-persistido');fixture.destroy();
  }));
  it('pausa al fallar y deja de consultar cuando se abandona la pantalla',fakeAsync(()=>{
    fixture=TestBed.createComponent(MisPedidosComponent);flushMicrotasks();api.misPedidos.and.rejectWith(new Error('Sin conexión'));
    tick(15000);flushMicrotasks();expect(fixture.componentInstance.pausado()).toBeTrue();const n=api.misPedidos.calls.count();
    tick(45000);expect(api.misPedidos.calls.count()).toBe(n);fixture.destroy();tick(45000);expect(api.misPedidos.calls.count()).toBe(n);
  }));
});
