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
import { fechaBadge } from '../shared/fecha-badge';

/**
 * Detalle de un evento con la compra de entradas (CU-006) — guiado por la
 * página de evento de las taquillas de referencia: tarjeta de fecha grande +
 * datos del recinto a la derecha del poster, y más abajo la tabla de
 * zona/precio (en vez de un simple <select>) para elegir dónde sentarse.
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

  readonly evento = computed(() => this.eventosService.obtenerPorId(this.route.snapshot.params['id']));
  readonly fechaBadge = fechaBadge;

  readonly zonaSeleccionada = signal(this.evento()?.zonas[0]?.nombre ?? '');
  readonly cantidad = signal(1);

  readonly precioZona = computed(
    () => this.evento()?.zonas.find((z) => z.nombre === this.zonaSeleccionada())?.precio ?? 0
  );
  readonly total = computed(() => this.precioZona() * this.cantidad());

  elegirZona(nombre: string): void {
    this.zonaSeleccionada.set(nombre);
    this.cantidad.set(1);
  }

  cambiarCantidad(delta: number): void {
    this.cantidad.update((c) => Math.min(10, Math.max(1, c + delta)));
  }

  comprar(): void {
    const evento = this.evento();
    if (!evento) return;

    // El detalle del evento y sus precios son públicos; la sesión se pide
    // aquí, al comprar, y no al entrar. Tras iniciarla se vuelve a este mismo
    // evento para que el visitante no pierda el hilo.
    const usuario = this.auth.usuarioActual();
    if (!usuario) {
      this.router.navigate(['/login'], { queryParams: { returnUrl: this.router.url } });
      return;
    }

    this.pagoService.registrar({
      titulo: `Entradas · ${evento.nombre}`,
      lineas: [{ etiqueta: `Entrada · ${this.zonaSeleccionada()}`, cantidad: this.cantidad(), precioUnitario: this.precioZona() }],
      rutaDestino: '/entradas',
      onConfirmar: () => {
        this.entradasService.comprar({
          eventoId: evento.id,
          eventoNombre: evento.nombre,
          fecha: evento.fecha,
          lugar: `${evento.lugar}, ${evento.ciudad}`,
          zona: this.zonaSeleccionada(),
          cantidad: this.cantidad(),
          propietarioId: usuario.id
        });
      }
    });
    this.router.navigateByUrl('/pago');
  }
}
