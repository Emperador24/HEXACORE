import { Component, EventEmitter, inject, Input, OnChanges, OnDestroy, Output, SimpleChanges, signal, ChangeDetectionStrategy } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { AuthService, ErrorCuenta } from '../core/auth.service';
import { EntregasApiService, IntencionEntrega, ResultadoEntrega, RevisionEntrega } from '../core/entregas-api.service';

@Component({ selector: 'app-entrega-pedido', standalone: true, imports: [DatePipe, FormsModule, MatButtonModule, MatFormFieldModule, MatInputModule],
  template: `
  <section class="panel" aria-label="Validación y entrega"><h2>Validar y entregar pedido</h2>
  <p>Selecciona el establecimiento y presenta el código completo del cliente. Consultarlo no entrega el pedido.</p>
  <form #f="ngForm" (ngSubmit)="f.valid && validar()">
  <mat-form-field><mat-label>Código QR completo</mat-label><input matInput name="codigoQr" [(ngModel)]="codigo" (ngModelChange)="revision.set(null)" required pattern="[a-fA-F0-9]{64}" maxlength="64" autocomplete="off" /></mat-form-field>
  <button mat-button type="submit" [disabled]="!f.valid || ocupado() || inactivo || !local">Validar código</button></form>
  @if(error()){<p role="alert">{{error()}}</p>}
  @if(pendiente()){<p>Entrega sin confirmar. Conservamos el identificador, sin almacenar el código QR.</p><button mat-button (click)="recuperar()" [disabled]="ocupado() || inactivo">Consultar entrega pendiente</button>}
  @if(revision(); as p){<section aria-label="Revisar entrega"><h3>Revisa antes de entregar</h3><p>Pedido {{p.pedidoId}}</p><p>Punto autorizado: {{p.puntoEntrega}}</p><p>Total acordado: {{p.total}} {{p.moneda}}</p>
  @for(d of p.productos; track $index){<p>{{d.cantidad}} × {{d.nombreProducto}}</p>}
  <p>Listo para entregar. Confirma solo después de revisar el pedido y entregarlo al cliente.</p>
  <button mat-flat-button (click)="confirmar()" [disabled]="ocupado() || inactivo">Confirmar entrega</button></section>}
  @if(resultado(); as r){<p role="status">Pedido entregado en {{r.entrega.puntoEntrega}} · {{r.entrega.entregadoEn | date:'short'}}. El código ya no permite otra entrega.</p>}
  </section>`, changeDetection: ChangeDetectionStrategy.Eager,
 styles: [`.panel{padding:1.2rem;border:1px solid var(--hxc-borde, #777);border-radius:16px;margin:1rem 0}mat-form-field{width:min(100%,40rem)}p{overflow-wrap:anywhere}[role=alert]{color:var(--hxc-rojo,#d33)}`] })
export class EntregaPedidoComponent implements OnChanges, OnDestroy {
  @Input() local = ''; @Input() inactivo = false;
  @Output() ocupacion = new EventEmitter<boolean>(); @Output() pendienteChange = new EventEmitter<boolean>(); @Output() entregada = new EventEmitter<void>();
  private readonly api = inject(EntregasApiService); private readonly auth = inject(AuthService);
  readonly revision = signal<RevisionEntrega | null>(null); readonly resultado = signal<ResultadoEntrega | null>(null);
  readonly pendiente = signal<IntencionEntrega | null>(null); readonly ocupado = signal(false); readonly error = signal('');
  codigo = ''; private destruido = false;
  private get clave() { return `hexacore.cu014.intencion.${this.auth.usuarioActual()?.id}`; }
  ngOnChanges(cambios: SimpleChanges) {
    if(!cambios['local']) return;
    this.codigo = ''; this.revision.set(null); this.resultado.set(null); this.error.set('');
    const guardado = localStorage.getItem(this.clave); this.pendiente.set(guardado ? JSON.parse(guardado) : null); this.pendienteChange.emit(!!this.pendiente());
  }
  ngOnDestroy() { this.destruido = true; this.codigo = ''; }
  private ocupar(valor: boolean) { this.ocupado.set(valor); this.ocupacion.emit(valor); }
  async validar() {
    if(this.ocupado() || this.inactivo || !this.local) return;
    this.ocupar(true); this.error.set(''); this.revision.set(null); this.resultado.set(null);
    try {
      const p = await this.api.prevalidar(this.local, this.codigo.trim().toLowerCase());
      if(!this.destruido) {
        const i = this.pendiente();
        if(i && (i.local !== this.local || i.pedidoId !== p.pedidoId || i.version !== p.version || i.puntoRevision !== p.puntoRevision)) throw new Error('Primero consulta el resultado de la entrega pendiente.');
        this.revision.set(p);
      }
    } catch(e) { this.error.set(e instanceof Error ? e.message : 'No pudimos validar el código.'); }
    finally { this.ocupar(false); }
  }
  async confirmar() {
    const p = this.revision(); if(!p || this.ocupado() || this.inactivo) return;
    const i = this.pendiente() ?? { id: crypto.randomUUID(), local: this.local, pedidoId: p.pedidoId, version: p.version, puntoRevision: p.puntoRevision };
    await this.enviar(i, this.codigo.trim().toLowerCase());
  }
  async recuperar() { const i = this.pendiente(); if(i && !this.ocupado() && !this.inactivo) await this.enviar(i); }
  private async enviar(i: IntencionEntrega, codigoQr?: string) {
    const clave = this.clave;
    this.ocupar(true); this.error.set(''); this.pendiente.set(i); localStorage.setItem(clave, JSON.stringify(i)); this.pendienteChange.emit(true);
    try {
      const r = await this.api.confirmar(i, codigoQr);
      this.pendiente.set(null); localStorage.removeItem(clave); this.pendienteChange.emit(false);
      if(!this.destruido) { this.resultado.set(r); this.revision.set(null); this.entregada.emit(); }
    } catch(e) {
      this.error.set(e instanceof Error ? e.message : 'No se confirmó la entrega. Consulta la misma operación.');
      if(e instanceof ErrorCuenta && [400,404,409].includes(e.estado) && !['QR_REQUERIDO','CLAVE_ENTREGA_INCOMPATIBLE'].includes(e.codigo)) {
        this.pendiente.set(null); localStorage.removeItem(clave); this.pendienteChange.emit(false);
      }
      this.revision.set(null);
    } finally { this.codigo = ''; this.ocupar(false); }
  }
}
