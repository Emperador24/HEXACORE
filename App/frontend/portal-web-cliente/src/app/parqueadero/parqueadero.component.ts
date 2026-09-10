import { Component, computed, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { Router } from '@angular/router';
import { MatTabsModule } from '@angular/material/tabs';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { EventosService } from '../core/eventos.service';
import { ParqueaderoService, TARIFA_PARQUEADERO, ZONAS_PARQUEADERO } from '../core/parqueadero.service';
import { PagoService } from '../core/pago.service';
import { QrPlaceholderComponent } from '../shared/qr-placeholder.component';

/**
 * Parqueadero del cliente (CU-021..CU-025): reservar un cupo nuevo y
 * consultar las reservas ya pagadas con su QR — mismo dato que
 * ParqueaderoScreen en app-movil-cliente, pero aquí es donde nace la
 * reserva (la app móvil solo la muestra una vez ya pagada).
 */
@Component({
  selector: 'app-parqueadero',
  standalone: true,
  imports: [DecimalPipe, MatTabsModule, MatCardModule, MatButtonModule, MatFormFieldModule, MatSelectModule, QrPlaceholderComponent],
  templateUrl: './parqueadero.component.html',
  styleUrl: './parqueadero.component.scss'
})
export class ParqueaderoComponent {
  private readonly eventosService = inject(EventosService);
  private readonly parqueaderoService = inject(ParqueaderoService);
  private readonly pagoService = inject(PagoService);
  private readonly router = inject(Router);

  readonly pestana = signal(0);
  readonly zonas = ZONAS_PARQUEADERO;
  readonly tarifa = TARIFA_PARQUEADERO;

  readonly eventosProximos = computed(() => this.eventosService.eventos().filter((e) => !e.pasado));
  readonly eventoSeleccionado = signal(this.eventosProximos()[0]?.id ?? '');
  readonly zonaSeleccionada = signal(this.zonas[0]);

  readonly reservas = this.parqueaderoService.reservas;

  reservar(): void {
    const evento = this.eventosService.obtenerPorId(this.eventoSeleccionado());
    if (!evento) return;

    this.pagoService.registrar({
      titulo: `Parqueadero · ${evento.nombre}`,
      lineas: [{ etiqueta: `Cupo · ${this.zonaSeleccionada()}`, cantidad: 1, precioUnitario: this.tarifa }],
      rutaDestino: '/cliente/parqueadero',
      onConfirmar: () =>
        this.parqueaderoService.reservar({
          eventoId: evento.id,
          eventoNombre: evento.nombre,
          lugarEvento: evento.lugar,
          zona: this.zonaSeleccionada()
        })
    });
    this.router.navigateByUrl('/cliente/pago');
  }

  enlaceComoLlegar(lugar: string): string {
    return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(lugar)}`;
  }
}
