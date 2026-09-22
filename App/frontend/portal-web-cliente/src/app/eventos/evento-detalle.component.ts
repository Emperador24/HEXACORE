import { Component, computed, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { EventosService } from '../core/eventos.service';
import { EntradasService } from '../core/entradas.service';
import { AuthService } from '../core/auth.service';
import { PagoService } from '../core/pago.service';
import { mensajeDeError } from '../core/reventa.service';
import { Evento, MetodoPago } from '../core/models';
import { fechaBadge } from '../shared/fecha-badge';
import { COLOR } from '../shared/acentos';

/** Los caminos de la pasarela simulada, para poder demostrar cada uno. */
const TOKENS_DEMO = [
  { valor: 'tok_ok_demo', etiqueta: 'Pago aprobado' },
  { valor: 'tok_rechazo_demo', etiqueta: 'Pago rechazado (CU-001C)' }
];

/**
 * Detalle de un evento con la compra de entradas (CU-005 + CU-001) — guiado
 * por la página de evento de las taquillas de referencia: tarjeta de fecha
 * grande + datos del recinto a la derecha del poster, y más abajo la tabla de
 * localidad/precio para elegir dónde sentarse.
 *
 * El detalle es público; la sesión se pide al comprar. La compra sigue los dos
 * pasos del servidor: al pulsar "Continuar al pago" se **reserva** el cupo (y
 * el servidor calcula el total), y en la pasarela se **paga**.
 */
@Component({
  selector: 'app-evento-detalle',
  standalone: true,
  imports: [RouterLink, DecimalPipe, MatCardModule, MatButtonModule, MatIconModule],
  templateUrl: './evento-detalle.component.html',
  styleUrl: './evento-detalle.component.scss'
})
export class EventoDetalleComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly eventosService = inject(EventosService);
  private readonly entradasService = inject(EntradasService);
  private readonly auth = inject(AuthService);
  private readonly pagoService = inject(PagoService);

  readonly fechaBadge = fechaBadge;
  readonly COLOR = COLOR;

  readonly evento = signal<Evento | undefined>(undefined);
  readonly cargando = signal(true);
  readonly reservando = signal(false);
  readonly error = signal<string | null>(null);

  readonly zonaSeleccionada = signal('');
  readonly cantidad = signal(1);

  private readonly zona = computed(() => this.evento()?.zonas.find((z) => z.nombre === this.zonaSeleccionada()));
  readonly precioZona = computed(() => this.zona()?.precio ?? 0);
  /** Lo que se muestra antes de reservar; el total que se cobra lo calcula el servidor. */
  readonly total = computed(() => this.precioZona() * this.cantidad());
  /** Tope de la cantidad: lo que queda en la localidad, sin pasar de 10 por compra. */
  readonly maximo = computed(() => Math.min(10, this.zona()?.disponibles ?? 10));

  constructor() {
    void this.cargar();
  }

  private async cargar(): Promise<void> {
    try {
      const evento = await this.eventosService.detalle(this.route.snapshot.params['id']);
      this.evento.set(evento);
      // Se preselecciona la primera localidad con cupo.
      const conCupo = evento.zonas.find((z) => !z.agotada) ?? evento.zonas[0];
      this.zonaSeleccionada.set(conCupo?.nombre ?? '');
    } catch {
      // Un borrador, un cancelado o un id inexistente: el backend responde 404
      // en los tres casos, y la plantilla muestra "Este evento no existe".
      this.evento.set(undefined);
    } finally {
      this.cargando.set(false);
    }
  }

  elegirZona(nombre: string): void {
    this.zonaSeleccionada.set(nombre);
    this.cantidad.set(1);
    this.error.set(null);
  }

  cambiarCantidad(delta: number): void {
    this.cantidad.update((c) => Math.min(this.maximo(), Math.max(1, c + delta)));
  }

  async comprar(): Promise<void> {
    const evento = this.evento();
    const zona = this.zona();
    if (!evento || !zona?.id || this.reservando()) return;

    // El detalle del evento y sus precios son públicos; la sesión se pide
    // aquí, al comprar, y no al entrar. Tras iniciarla se vuelve a este mismo
    // evento para que el visitante no pierda el hilo.
    if (!this.auth.usuarioActual()) {
      this.router.navigate(['/login'], { queryParams: { returnUrl: this.router.url } });
      return;
    }

    // Paso 1 de 2: reservar. Si ya no hay cupo (CU-001A), se dice aquí mismo,
    // antes de pasar a pagar.
    this.reservando.set(true);
    this.error.set(null);
    let compra;
    try {
      compra = await this.entradasService.reservar(zona.id, this.cantidad());
    } catch (error) {
      this.error.set(mensajeDeError(error));
      return;
    } finally {
      this.reservando.set(false);
    }

    // Paso 2 de 2: pagar en la pasarela. El resumen usa el precio que devolvió
    // el servidor, no el que tenía la pantalla.
    this.pagoService.registrar({
      titulo: `Entradas · ${evento.nombre}`,
      lineas: [{ etiqueta: `Entrada · ${zona.nombre}`, cantidad: compra.cantidad, precioUnitario: compra.precioUnitario }],
      rutaDestino: '/entradas',
      metodos: [MetodoPago.TARJETA, MetodoPago.PSE],
      tokensDemo: TOKENS_DEMO,
      onConfirmar: async (metodo, token) => {
        await this.entradasService.pagar(compra.id, metodo, token ?? TOKENS_DEMO[0].valor);
      }
    });
    this.router.navigateByUrl('/pago');
  }
}
