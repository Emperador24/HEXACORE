import { Component, computed, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatTabsModule } from '@angular/material/tabs';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { EventosService } from '../core/eventos.service';
import { fechaBadge } from '../shared/fecha-badge';

/**
 * Eventos del cliente (CU-001..CU-005), separados en Próximos/Pasados —
 * mismo criterio que InicioScreen en app-movil-cliente. El primero de la
 * pestaña activa se destaca en grande (patrón "Destacados" de las taquillas
 * de referencia); el resto va en grilla con su badge de fecha. Al
 * seleccionar un evento se entra al detalle, donde está la compra de
 * entradas (CU-006).
 */
@Component({
  selector: 'app-eventos-lista',
  standalone: true,
  imports: [RouterLink, DecimalPipe, MatTabsModule, MatCardModule, MatButtonModule],
  templateUrl: './eventos-lista.component.html',
  styleUrl: './eventos-lista.component.scss'
})
export class EventosListaComponent {
  private readonly eventosService = inject(EventosService);

  readonly pestana = signal(0);
  readonly fechaBadge = fechaBadge;

  private readonly ordenados = computed(() =>
    [...this.eventosService.eventos()].sort((a, b) => (a.fecha < b.fecha ? 1 : -1))
  );
  readonly proximos = computed(() => this.ordenados().filter((e) => !e.pasado));
  readonly pasados = computed(() => this.ordenados().filter((e) => e.pasado));
  readonly visibles = computed(() => (this.pestana() === 0 ? this.proximos() : this.pasados()));

  readonly destacado = computed(() => this.visibles()[0]);
  readonly resto = computed(() => this.visibles().slice(1));
}
