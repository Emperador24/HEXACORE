import { Component, inject, OnDestroy, signal, ChangeDetectionStrategy } from '@angular/core';
import { DatePipe } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Subscription } from 'rxjs';
import { MatButtonModule } from '@angular/material/button';
import { PedidosService, SeguimientoPedido } from '../core/pedidos.service';
import { QrPedidoComponent } from './qr-pedido.component';

@Component({ selector: 'app-mis-pedidos', standalone: true, imports: [DatePipe, RouterLink, MatButtonModule, QrPedidoComponent],
  template: `
  <header><h1>Mis pedidos y avisos</h1><p>Avance guardado por tu establecimiento. Conservas el mismo comprobante al volver a entrar.</p>
  <a mat-button routerLink="/pedidos">Hacer un pedido</a><button mat-button (click)="actualizar()" [disabled]="cargando()">Actualizar seguimiento</button></header>
  @if(error()){<p role="alert">{{error()}}</p>}
  @if(pausado()){<p>Actualización automática pausada. Usa Actualizar seguimiento.</p>}
  <div class="grilla"><section><h2>Tus pedidos</h2><p>Página {{pagina() + 1}}</p><button mat-button (click)="cambiarPagina(-1)" [disabled]="cargando() || pagina() === 0">Pedidos más recientes</button><button mat-button (click)="cambiarPagina(1)" [disabled]="cargando() || pedidos().length < 100">Pedidos anteriores</button>
  @for(p of pedidos(); track p.id){<article class="hxc-vidrio" [attr.data-pedido]="p.id"><h3>{{p.establecimiento}}</h3><p>{{p.total}} {{p.moneda}} · {{p.estado}}</p><p>{{etiqueta(p.estadoOperativo ?? p.preparacion.estado)}}</p><a mat-button [routerLink]="['/mis-pedidos',p.id]">Ver seguimiento</a></article>}
  @empty{ @if(!cargando()){<p>No hay pedidos en esta página.</p>} }
  </section>
  @if(detalle(); as p){<section class="hxc-vidrio detalle" aria-label="Seguimiento del pedido"><h2>{{p.establecimiento}}</h2><p data-avance>{{etiqueta(p.estadoOperativo ?? p.preparacion.estado)}}</p><p>{{p.estado}} · Total acordado {{p.total}} {{p.moneda}}</p>
  @if(p.preparacion.estimadoListoEn){<p>Estimado listo: <time data-estimacion>{{p.preparacion.estimadoListoEn | date:'short'}}</time></p>}
  @if(p.preparacion.retrasado){<p>La estimación se ha superado. El establecimiento debe actualizar el tiempo.</p>}
  @if(p.entrega){<p>Entregado el <time data-entregado>{{p.entrega.entregadoEn | date:'short'}}</time> en {{p.entrega.puntoEntrega}}. El QR ya no permite otra entrega.</p>}@else if(p.estado === 'CONFIRMADO' && p.preparacion.estado === 'LISTO_PARA_ENTREGAR'){<p>Presenta tu QR en el punto autorizado para recibir el pedido.</p>}
  @if(p.cancelacion; as c){<section aria-label="Cancelación y reembolso"><h3>Pedido cancelado por el establecimiento</h3><p>{{c.motivo}}</p><p>Fecha: <time data-cancelado>{{c.canceladoEn | date:'short'}}</time></p><p data-reembolso>Reembolso {{estadoReembolso(c.reembolso.estado)}} · {{c.reembolso.monto}} {{c.reembolso.moneda}}</p>@if(c.reembolso.estado === 'APROBADO'){<p>La pasarela confirmó la aprobación del reembolso total.</p>}@else{<p>No se confirma dinero devuelto. El pedido permanece cancelado.</p>}</section>}
  @for(d of p.productos; track $index){<p>{{d.cantidad}} × {{d.nombreProducto}} · {{d.precioUnitario}} {{p.moneda}}</p><p>{{d.descripcionProducto}}</p><small>{{d.restriccionesAlimentarias.join(', ')}}</small>}
  @if(p.codigoQr && p.qrUtilizable !== false){<app-qr-pedido [codigo]="p.codigoQr" /><p>Punto de entrega: {{p.puntoEntrega}}</p>}
  @else if(!p.entrega){<p>El QR solo está disponible para pedidos confirmados con pago aprobado.</p>}
  <h3>Avisos del establecimiento</h3><p>Canal dentro de la web/app; no son correos ni mensajes push.</p>
  @for(a of p.avisos; track a.id){<article class="aviso" [attr.data-aviso]="a.id"><time>{{a.creadoEn | date:'short'}}</time><p>{{a.mensaje}}</p></article>}
  @empty{<p>Aún no hay avisos de preparación.</p>}
  <h3>Incidencias</h3>@for(i of p.incidencias; track i.id){<p>{{i.descripcion}} · {{i.resueltaEn ? 'Resuelta: ' + i.resolucion : 'Pendiente de resolver'}}</p>}
  </section>}</div>`,
  changeDetection: ChangeDetectionStrategy.Eager,
  styles: [`:host{display:block;padding:1rem}article,.detalle{padding:1.2rem;margin:1rem 0}.grilla{display:grid;grid-template-columns:minmax(220px,1fr) minmax(300px,1.6fr);gap:1rem}.aviso{border-left:3px solid var(--hxc-ambar);padding-left:1rem}p{overflow-wrap:anywhere}[role=alert]{color:var(--hxc-rojo,#ffb4ab)}@media(max-width:800px){.grilla{grid-template-columns:1fr}}`]
})
export class MisPedidosComponent implements OnDestroy {
  private readonly api = inject(PedidosService); private readonly ruta = inject(ActivatedRoute);
  readonly pedidos = signal<SeguimientoPedido[]>([]); readonly detalle = signal<SeguimientoPedido | null>(null);
  readonly pagina = signal(0); readonly cargando = signal(false); readonly error = signal(''); readonly pausado = signal(false);
  private id: string | null = null; private destruido = false; private recargarDespues = false;
  private readonly timer: ReturnType<typeof setInterval>; private readonly suscripcion: Subscription;
  constructor() {
    this.suscripcion = this.ruta.paramMap.subscribe(p => { this.id = p.get('pedidoId'); this.detalle.set(null); if (this.cargando()) this.recargarDespues = true; else void this.actualizar(); });
    this.timer = setInterval(() => { if(document.visibilityState === 'visible' && !this.cargando() && !this.pausado()) void this.actualizar(); }, 15000);
  }
  ngOnDestroy() { this.destruido = true; clearInterval(this.timer); this.suscripcion.unsubscribe(); }
  async actualizar() {
    if(this.cargando()) return; const id = this.id; this.cargando.set(true); this.error.set(''); this.pausado.set(false);
    try {
      const pedidos = await this.api.misPedidos(this.pagina()); if(this.destruido) return; this.pedidos.set(pedidos);
      if(id) { const p = await this.api.seguimiento(id); if(!this.destruido && id === this.id) this.detalle.set(p); }
    } catch(e) { this.error.set(e instanceof Error ? e.message : 'No pudimos consultar tus pedidos.'); this.pausado.set(true); }
    finally { this.cargando.set(false); if(this.recargarDespues && !this.destruido){this.recargarDespues=false;void this.actualizar();} }
  }
  async cambiarPagina(delta: number) {
    if(this.cargando() || this.pagina() + delta < 0) return;
    this.pagina.update(p => p + delta); this.pedidos.set([]); await this.actualizar();
  }
  estadoReembolso(e: string) { return ({PENDIENTE:'pendiente',APROBADO:'aprobado',RECHAZADO:'rechazado',INCIERTO:'incierto'} as Record<string,string>)[e] ?? e; }
  etiqueta(estado: string) { return ({RECIBIDO:'Recibido por el establecimiento',EN_PREPARACION:'En preparación',LISTO_PARA_ENTREGAR:'Listo para entregar',ENTREGADO:'Entregado',CANCELADO:'Cancelado'} as Record<string,string>)[estado] ?? estado; }
}
