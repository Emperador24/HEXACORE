import { Component, EventEmitter, inject, Input, OnChanges, Output, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { AuthService, ErrorCuenta } from '../core/auth.service';
import { CancelacionPedido, IntencionCancelacion, PedidoRecibido, PreparacionApiService } from '../core/preparacion-api.service';

@Component({ selector: 'app-cancelacion-pedido', standalone: true, imports: [DatePipe, FormsModule, MatButtonModule],
  template: `<section aria-label="Cancelación del pedido"><h3>Cancelación por el establecimiento</h3>
  @if(error()){<p role="alert">{{error()}}</p>}
  @if(resultado(); as c){<p role="status">Pedido cancelado: {{c.motivo}}</p><p>Fecha: {{c.canceladoEn | date:'short'}}</p>
    <p data-reembolso>Reembolso {{etiqueta(c.reembolso.estado)}} · {{c.reembolso.monto}} {{c.reembolso.moneda}}</p>
    @if(c.reembolso.estado === 'APROBADO'){<p>La pasarela confirmó la aprobación del reembolso.</p>}
    @else{<p>El pedido está cancelado; no se confirma dinero devuelto. {{c.reembolso.estado === 'INCIERTO' ? 'Se conserva la misma operación sin reenviarla al proveedor.' : ''}}</p>}
    <p>Inventario: {{c.inventario}}. No se reincorpora automáticamente comida preparada.</p>
    <button mat-button (click)="consultar()" [disabled]="ocupado() || inactivo">Consultar cancelación y reembolso</button>
  }@else if(pedido.estado === 'CONFIRMADO' && pedido.pagoVerificado && !pedido.entrega && !pendiente()){
    <button mat-button (click)="abrir()" [disabled]="ocupado() || inactivo">Cancelar pedido</button>
  }
  @if(formulario && !pendiente()){
    <form #f="ngForm" (ngSubmit)="f.valid && confirmar && guardar()">
      <label>Motivo de cancelación<textarea name="motivoCancelacion" [(ngModel)]="motivo" required minlength="3" maxlength="200"></textarea></label>
      <p>La cancelación impide preparar o entregar. El reembolso tiene un resultado independiente. Solo se restituyen unidades si no comenzó la preparación.</p>
      <label><input type="checkbox" name="confirmarCancelacion" [(ngModel)]="confirmar" /> Confirmo cancelar este pedido y solicitar su reembolso total</label>
      <button mat-flat-button type="submit" [disabled]="!f.valid || !confirmar || ocupado() || inactivo">Confirmar cancelación</button>
      <button mat-button type="button" (click)="formulario=false">Volver sin cancelar</button>
    </form>
  }
  @if(pendiente()){<p>Cancelación sin respuesta confirmada. Se conserva la misma operación.</p>
    <button mat-button (click)="recuperar()" [disabled]="ocupado() || inactivo">Consultar cancelación pendiente</button>}
  </section>`, styles: [`section{border-top:1px solid #888;padding:1rem 0}label{display:block;margin:1rem 0}textarea{display:block;width:min(100%,40rem);min-height:5rem}p{overflow-wrap:anywhere}`] })
export class CancelacionPedidoComponent implements OnChanges {
  @Input({ required: true }) local = ''; @Input({ required: true }) pedido!: PedidoRecibido; @Input() inactivo = false;
  @Output() ocupacion = new EventEmitter<boolean>(); @Output() pendienteChange = new EventEmitter<boolean>(); @Output() cambiada = new EventEmitter<void>();
  private readonly api = inject(PreparacionApiService); private readonly auth = inject(AuthService);
  readonly resultado = signal<CancelacionPedido | null>(null); readonly pendiente = signal<IntencionCancelacion | null>(null);
  readonly ocupado = signal(false); readonly error = signal('');
  formulario = false; confirmar = false; motivo = ''; private version = 0; private pedidoFormulario = '';
  private get clave() { return `hexacore.cu011f.intencion.${this.auth.usuarioActual()?.id}`; }
  ngOnChanges() {
    if (this.pedidoFormulario && this.pedidoFormulario !== this.pedido?.id) { this.formulario = false; this.confirmar = false; this.motivo = ''; }
    this.resultado.set(this.pedido?.cancelacion ?? null);
    const raw = localStorage.getItem(this.clave); const i: IntencionCancelacion | null = raw ? JSON.parse(raw) : null;
    this.pendiente.set(i); this.pendienteChange.emit(!!i);
  }
  abrir() { this.pedidoFormulario = this.pedido.id; this.version = this.pedido.preparacion.version; this.motivo = ''; this.confirmar = false; this.formulario = true; }
  private ocupar(v: boolean) { this.ocupado.set(v); this.ocupacion.emit(v); }
  async guardar() {
    if (!this.confirmar || this.pedidoFormulario !== this.pedido.id || this.pendiente() || this.motivo.trim().length < 3) return;
    await this.enviar({ id: crypto.randomUUID(), local: this.local, pedido: this.pedido.id,
      datos: { version: this.version, motivo: this.motivo.trim(), confirmar: true } });
  }
  async recuperar() { const i = this.pendiente(); if (i) await this.enviar(i); }
  private async enviar(i: IntencionCancelacion) {
    if (this.ocupado() || this.inactivo) return;
    const clave = this.clave; this.ocupar(true); this.error.set(''); let refrescar = false;
    try {
      this.pendiente.set(i); localStorage.setItem(clave, JSON.stringify(i)); this.pendienteChange.emit(true);
      this.resultado.set(await this.api.cancelar(i));
      this.pendiente.set(null); localStorage.removeItem(clave); this.pendienteChange.emit(false); this.formulario = false; refrescar = true;
    } catch(e) {
      this.error.set(e instanceof Error ? e.message : 'No se confirmó el resultado. Consulta la misma operación.');
      if (e instanceof ErrorCuenta && [400,404,409].includes(e.estado) && e.codigo !== 'CLAVE_CANCELACION_INCOMPATIBLE') {
        this.pendiente.set(null); localStorage.removeItem(clave); this.pendienteChange.emit(false); this.formulario = false; refrescar = true;
      }
    } finally { this.ocupar(false); if (refrescar) this.cambiada.emit(); }
  }
  async consultar() {
    if (this.ocupado() || this.inactivo) return;
    this.ocupar(true); this.error.set('');
    try { this.resultado.set(await this.api.cancelacion(this.local, this.pedido.id)); }
    catch(e) { this.error.set(e instanceof Error ? e.message : 'No se confirmó el seguimiento.'); }
    finally { this.ocupar(false); this.cambiada.emit(); }
  }
  etiqueta(e: string) { return ({ PENDIENTE: 'pendiente', APROBADO: 'aprobado', RECHAZADO: 'rechazado', INCIERTO: 'incierto' } as Record<string,string>)[e] ?? e; }
}
