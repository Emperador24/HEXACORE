import { Component, OnInit, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { Compra, CotizacionCancelacion, EntradasService } from '../core/entradas.service';
import { EventosService } from '../core/eventos.service';
import { mensajeDeError } from '../core/reventa.service';
import { QrPedidoComponent } from '../pedidos/qr-pedido.component';
import { COLOR } from '../shared/acentos';

const ESTADOS_COMPRA: Record<string, string> = {
  PAGADA: 'Pagada',
  PARCIALMENTE_CANCELADA: 'Cancelada en parte',
  CANCELADA: 'Cancelada'
};

const ESTADOS_ENTRADA: Record<string, string> = {
  VALIDA: 'Válida',
  EN_REVENTA: 'En reventa',
  USADA: 'Usada',
  ANULADA: 'Anulada'
};

/** La cancelación en curso: qué se cotizó y sobre qué entradas. */
interface CancelacionEnCurso {
  compra: Compra;
  entradaIds?: string[];
  cotizacion: CotizacionCancelacion;
}

/**
 * Mis compras — CU-002 y CU-003 del lado del cliente, contra Boletería.
 *
 * Cada compra muestra el QR de sus entradas (lo que se presenta en la puerta)
 * y permite cancelar. La política de reembolso no se calcula aquí: primero se
 * pide la **cotización** al servidor (pasos 2-4) y la persona confirma con el
 * monto que vio; si el servidor lo recalculó distinto, rechaza la cancelación.
 * Es el mismo contrato que usa la app móvil (RNF-14).
 */
@Component({
  selector: 'app-mis-compras',
  standalone: true,
  imports: [DecimalPipe, MatButtonModule, MatCardModule, QrPedidoComponent],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <h2>Mis compras</h2>
    @if (aviso(); as mensaje) {
      <p class="aviso" role="status">{{ mensaje }}</p>
    }
    @if (error(); as mensaje) {
      <p class="error" role="alert">{{ mensaje }}</p>
    }
    @if (!cargando() && compras().length === 0) {
      <p class="vacio">Todavía no tienes compras.</p>
    }
    <div class="lista">
      @for (compra of compras(); track compra.id) {
        <mat-card class="compra" [attr.data-prueba]="'compra-' + compra.numeroCompra">
          <mat-card-header>
            <mat-card-title>{{ nombreEvento(compra.eventoId) }}</mat-card-title>
            <mat-card-subtitle>
              Compra {{ compra.numeroCompra }} · {{ compra.cantidad }} entradas · \${{ compra.total | number: '1.0-0' }}
            </mat-card-subtitle>
          </mat-card-header>
          <mat-card-content>
            <span class="hxc-badge" [style.--tinte]="compra.estado === 'PAGADA' ? COLOR.verde : COLOR.rosa">
              {{ etiquetaCompra(compra.estado) }}
            </span>
            @if (abierta() === compra.id) {
              @if (detalle(); as d) {
                <div class="entradas">
                  @for (entrada of d.entradas; track entrada.id) {
                    <div class="entrada">
                      <strong>{{ entrada.localidadNombre }}</strong>
                      <span>Ticket {{ entrada.numeroTicket }} · {{ etiquetaEntrada(entrada.estado) }}</span>
                      @if (entrada.estado === 'VALIDA') {
                        <app-qr-pedido [codigo]="entrada.codigoQr" descripcion="Código QR de la entrada" />
                        <code class="codigo">{{ entrada.codigoQr }}</code>
                        @if (d.entradas.length > 1) {
                          <button mat-button type="button" (click)="cotizar(d, [entrada.id])">Cancelar esta entrada</button>
                        }
                      }
                    </div>
                  }
                </div>
              } @else {
                <p>Cargando entradas…</p>
              }
            }
          </mat-card-content>
          <mat-card-actions>
            <button mat-button type="button" data-prueba="compra-ver" (click)="alternar(compra)">
              {{ abierta() === compra.id ? 'Ocultar entradas' : 'Ver entradas y QR' }}
            </button>
            @if (compra.estado !== 'CANCELADA') {
              <button mat-button type="button" data-prueba="compra-cancelar" (click)="cotizar(compra)">Cancelar compra</button>
            }
          </mat-card-actions>
        </mat-card>
      }
    </div>

    @if (enCancelacion(); as c) {
      <div class="panel-flotante">
        <mat-card class="panel">
          <mat-card-header>
            <mat-card-title>Cancelar entradas</mat-card-title>
            <mat-card-subtitle>{{ nombreEvento(c.compra.eventoId) }} · Compra {{ c.compra.numeroCompra }}</mat-card-subtitle>
          </mat-card-header>
          <mat-card-content>
            <p>{{ c.cotizacion.mensaje }}</p>
            <p class="monto">
              Reembolso: <strong>\${{ c.cotizacion.montoReembolso | number: '1.0-0' }}</strong>
              ({{ c.cotizacion.porcentajeReembolso }} %)
            </p>
            @for (r of c.cotizacion.entradasRechazadas; track r.entradaId) {
              <p class="rechazada">• {{ r.motivo }}</p>
            }
            <label class="campo-motivo">
              <span>Motivo (obligatorio)</span>
              <textarea
                rows="2"
                maxlength="500"
                data-prueba="cancelacion-motivo"
                [value]="motivo()"
                (input)="motivo.set($any($event.target).value)"
              ></textarea>
            </label>
          </mat-card-content>
          <mat-card-actions align="end">
            <button mat-button type="button" (click)="enCancelacion.set(null)">Volver</button>
            <button
              mat-flat-button
              color="primary"
              type="button"
              data-prueba="cancelacion-confirmar"
              [disabled]="motivo().trim().length < 3 || cancelando()"
              (click)="confirmar()"
            >
              @if (cancelando()) { Cancelando… } @else { Confirmar cancelación }
            </button>
          </mat-card-actions>
        </mat-card>
      </div>
    }
  `,
  styles: [
    `
      h2 { margin: 0 0 12px; }
      .lista { display: grid; gap: 16px; grid-template-columns: repeat(auto-fill, minmax(min(100%, 320px), 1fr)); margin-bottom: 32px; }
      .entradas { display: grid; gap: 16px; margin-top: 16px; }
      .entrada { display: flex; flex-direction: column; align-items: center; gap: 6px; text-align: center; }
      .codigo { overflow-wrap: anywhere; font-weight: 700; }
      .monto { font-size: 1.05rem; }
      .rechazada { margin: 4px 0; opacity: 0.8; }
      .campo-motivo { display: flex; flex-direction: column; gap: 4px; margin-top: 12px; }
      .campo-motivo textarea { padding: 8px 10px; border-radius: 8px; border: 1px solid rgb(var(--hxc-texto-rgb) / 0.24); background: transparent; color: inherit; font: inherit; }
      .panel-flotante { position: fixed; inset: 0; display: grid; place-items: center; padding: 16px; background: rgb(0 0 0 / 0.45); z-index: 20; }
      .panel { width: min(100%, 460px); }
      .error { padding: 12px 14px; border-left: 3px solid var(--hxc-rojo); background: color-mix(in srgb, var(--hxc-rojo) 10%, transparent); color: var(--hxc-rojo); }
      .aviso { padding: 12px 14px; border-left: 3px solid var(--hxc-verde, green); }
    `
  ]
})
export class MisComprasComponent implements OnInit {
  private readonly entradasService = inject(EntradasService);
  private readonly eventos = inject(EventosService);

  readonly COLOR = COLOR;
  readonly compras = signal<Compra[]>([]);
  readonly cargando = signal(true);
  readonly error = signal<string | null>(null);
  readonly aviso = signal<string | null>(null);

  readonly abierta = signal<string | null>(null);
  readonly detalle = signal<Compra | null>(null);

  readonly enCancelacion = signal<CancelacionEnCurso | null>(null);
  readonly motivo = signal('');
  readonly cancelando = signal(false);

  ngOnInit(): void {
    void this.cargar();
  }

  async cargar(): Promise<void> {
    this.cargando.set(true);
    try {
      const todas = await this.entradasService.misCompras();
      this.compras.set(todas.filter((c) => c.estado in ESTADOS_COMPRA));
    } catch (error) {
      this.error.set(mensajeDeError(error));
    } finally {
      this.cargando.set(false);
    }
  }

  nombreEvento(eventoId: string): string {
    return this.eventos.obtenerPorId(eventoId)?.nombre ?? 'Evento';
  }

  etiquetaCompra(estado: string): string {
    return ESTADOS_COMPRA[estado] ?? estado;
  }

  etiquetaEntrada(estado: string): string {
    return ESTADOS_ENTRADA[estado] ?? estado;
  }

  /** CU-002: las entradas y su QR se piden al abrir la compra (el listado no las trae). */
  async alternar(compra: Compra): Promise<void> {
    if (this.abierta() === compra.id) {
      this.abierta.set(null);
      return;
    }
    this.abierta.set(compra.id);
    this.detalle.set(null);
    try {
      this.detalle.set(await this.entradasService.detalle(compra.id));
    } catch (error) {
      this.error.set(mensajeDeError(error));
    }
  }

  /** CU-003, pasos 2-4: cotización sin cambiar nada. */
  async cotizar(compra: Compra, entradaIds?: string[]): Promise<void> {
    this.error.set(null);
    this.aviso.set(null);
    try {
      const cotizacion = await this.entradasService.cotizarCancelacion(compra.id, entradaIds);
      this.motivo.set('');
      this.enCancelacion.set({ compra, entradaIds, cotizacion });
    } catch (error) {
      this.error.set(mensajeDeError(error));
    }
  }

  /** CU-003, pasos 5-9: confirma con el monto que la persona vio. */
  async confirmar(): Promise<void> {
    const c = this.enCancelacion();
    if (!c || this.cancelando()) return;
    this.cancelando.set(true);
    try {
      const resultado = await this.entradasService.cancelar(c.compra.id, this.motivo(), c.cotizacion.montoReembolso, c.entradaIds);
      this.aviso.set(resultado.mensaje);
      this.enCancelacion.set(null);
      this.abierta.set(null);
      await this.cargar();
    } catch (error) {
      this.error.set(mensajeDeError(error));
      this.enCancelacion.set(null);
    } finally {
      this.cancelando.set(false);
    }
  }
}
