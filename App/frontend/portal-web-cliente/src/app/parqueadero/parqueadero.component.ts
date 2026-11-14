import { Component, DestroyRef, computed, effect, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { Router } from '@angular/router';
import { MatTabsModule } from '@angular/material/tabs';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatIconModule } from '@angular/material/icon';
import { ErrorCuenta } from '../core/auth.service';
import { EventosService } from '../core/eventos.service';
import { ParqueaderoService } from '../core/parqueadero.service';
import { PagoService } from '../core/pago.service';
import { mensajeDeError } from '../core/reventa.service';
import { DisponibilidadParqueadero, MetodoPago, ReservaParqueadero, TipoVehiculo } from '../core/models';
import { QrPedidoComponent } from '../pedidos/qr-pedido.component';

/** Los caminos de la pasarela simulada, para poder demostrar cada uno. */
const TOKENS_DEMO = [
  { valor: 'tok_ok_demo', etiqueta: 'Pago aprobado' },
  { valor: 'tok_rechazo_demo', etiqueta: 'Pago rechazado (CU-021B)' }
];

const PLACA = /^[A-Za-z0-9-]{4,10}$/;

export const TIPOS: { valor: TipoVehiculo; etiqueta: string }[] = [
  { valor: 'AUTOMOVIL', etiqueta: 'Automóvil' },
  { valor: 'MOTO', etiqueta: 'Moto' },
  { valor: 'DISCAPACIDAD', etiqueta: 'Movilidad reducida' }
];

const ESTADOS: Record<ReservaParqueadero['estado'], string> = {
  PENDIENTE_PAGO: 'Pendiente de pago',
  PAGANDO: 'Pago en proceso',
  CONFIRMADA: 'Confirmada',
  USADA: 'Usada',
  EXPIRADA: 'Vencida'
};

/**
 * Parqueadero del cliente (CU-021): consultar zonas y precio, reservar un
 * espacio y pagarlo, y ver las reservas con su QR para el punto de control
 * (CU-022). Mismo contrato que la pantalla de la app móvil.
 */
@Component({
  selector: 'app-parqueadero',
  standalone: true,
  imports: [
    DatePipe, DecimalPipe, MatTabsModule, MatCardModule, MatButtonModule, MatFormFieldModule, MatInputModule, MatSelectModule,
    MatIconModule, QrPedidoComponent
  ],
  templateUrl: './parqueadero.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './parqueadero.component.scss'
})
export class ParqueaderoComponent {
  private readonly eventosService = inject(EventosService);
  private readonly parqueaderoService = inject(ParqueaderoService);
  private readonly pagoService = inject(PagoService);
  private readonly router = inject(Router);

  readonly tipos = TIPOS;
  readonly pestana = signal(0);
  readonly eventosProximos = computed(() => this.eventosService.eventos().filter((e) => !e.pasado));
  readonly eventoSeleccionado = signal('');
  readonly disponibilidad = signal<DisponibilidadParqueadero | null>(null);
  readonly cargando = signal(false);
  readonly zonaSeleccionada = signal('');
  readonly tipo = signal<TipoVehiculo>('AUTOMOVIL');
  readonly placa = signal('');
  readonly reservando = signal(false);
  readonly error = signal<string | null>(null);
  /** CU-021A: zonas con espacio cuando la elegida no tiene. */
  readonly alternativas = signal<{ id: string; nombre: string; disponibles: number }[]>([]);
  readonly reservas = this.parqueaderoService.reservas;
  readonly errorReservas = signal<string | null>(null);
  /** Avanza cada segundo para la cuenta atrás del pago (CU-021C). */
  readonly ahora = signal(Date.now());

  readonly zona = computed(() => this.disponibilidad()?.zonas.find((z) => z.id === this.zonaSeleccionada()));
  readonly libresDelTipo = computed(() => this.zona()?.disponibles[this.tipo()] ?? 0);
  readonly placaValida = computed(() => PLACA.test(this.placa().trim()));

  constructor() {
    effect(() => {
      const primero = this.eventosProximos()[0]?.id;
      if (!this.eventoSeleccionado() && primero) this.elegirEvento(primero);
    });
    const reloj = setInterval(() => this.ahora.set(Date.now()), 1000);
    inject(DestroyRef).onDestroy(() => clearInterval(reloj));
    void this.cargarReservas();
  }

  async elegirEvento(id: string): Promise<void> {
    this.eventoSeleccionado.set(id);
    this.disponibilidad.set(null);
    this.alternativas.set([]);
    this.error.set(null);
    this.cargando.set(true);
    try {
      const d = await this.parqueaderoService.disponibilidad(id);
      this.disponibilidad.set(d);
      const conEspacio = d.zonas.find((z) => z.disponibles[this.tipo()] > 0) ?? d.zonas[0];
      this.zonaSeleccionada.set(conEspacio?.id ?? '');
    } catch (error) {
      this.error.set(mensajeDeError(error));
    } finally {
      this.cargando.set(false);
    }
  }

  elegirZona(id: string): void {
    this.zonaSeleccionada.set(id);
    this.alternativas.set([]);
    this.error.set(null);
  }

  editarPlaca(evento: Event): void {
    this.placa.set((evento.target as HTMLInputElement).value.toUpperCase());
  }

  /** Pasos 3-4: reserva; luego la pasarela cobra (pasos 5-9). */
  async reservar(): Promise<void> {
    const evento = this.eventoSeleccionado();
    if (!evento || !this.zona() || !this.placaValida() || this.reservando()) return;
    this.reservando.set(true);
    this.error.set(null);
    this.alternativas.set([]);
    try {
      const reserva = await this.parqueaderoService.reservar(evento, {
        zonaId: this.zonaSeleccionada(), placa: this.placa().trim(), tipoVehiculo: this.tipo()
      });
      this.irAPagar(reserva);
    } catch (error) {
      this.error.set(mensajeDeError(error));
      if (error instanceof ErrorCuenta && error.codigo === 'CU-021A') {
        this.alternativas.set((error.detalle?.['alternativas'] as { id: string; nombre: string; disponibles: number }[]) ?? []);
      }
      void this.elegirEvento(evento);
    } finally {
      this.reservando.set(false);
    }
  }

  /** También desde "Mis reservas", para una pendiente o tras un rechazo. */
  irAPagar(reserva: ReservaParqueadero): void {
    this.pagoService.registrar({
      titulo: `Parqueadero · ${reserva.evento?.nombre ?? ''}`,
      lineas: [{ etiqueta: `${reserva.zona} · espacio ${reserva.espacio} · ${reserva.horas} h`, cantidad: 1, precioUnitario: reserva.monto }],
      rutaDestino: '/parqueadero',
      metodos: [MetodoPago.TARJETA, MetodoPago.PSE],
      tokensDemo: TOKENS_DEMO,
      onConfirmar: async (_metodo, token) => {
        await this.parqueaderoService.pagar(reserva.id, token ?? TOKENS_DEMO[0].valor);
      }
    });
    this.router.navigateByUrl('/pago');
  }

  async cargarReservas(): Promise<void> {
    this.errorReservas.set(null);
    try {
      await this.parqueaderoService.cargar();
    } catch (error) {
      this.errorReservas.set(mensajeDeError(error));
    }
  }

  estado(reserva: ReservaParqueadero): string {
    return ESTADOS[reserva.estado];
  }

  /** mm:ss que quedan para pagar antes de que se libere el espacio. */
  restante(reserva: ReservaParqueadero): string {
    const segundos = Math.max(0, Math.round((new Date(reserva.expiraEn).getTime() - this.ahora()) / 1000));
    return `${Math.floor(segundos / 60)}:${String(segundos % 60).padStart(2, '0')}`;
  }

  vencida(reserva: ReservaParqueadero): boolean {
    return new Date(reserva.expiraEn).getTime() <= this.ahora();
  }

  enlaceComoLlegar(reserva: ReservaParqueadero): string | null {
    const evento = this.eventosService.obtenerPorId(reserva.eventoId);
    return evento ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${evento.lugar}, ${evento.ciudad}`)}` : null;
  }

  nombreTipo(valor: TipoVehiculo): string {
    return TIPOS.find((t) => t.valor === valor)?.etiqueta ?? valor;
  }
}
