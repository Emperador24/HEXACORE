import { Component, computed, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatTabsModule } from '@angular/material/tabs';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { EventosService } from '../core/eventos.service';
import { CATEGORIAS, CategoriaEvento, Evento } from '../core/models';
import { fechaBadge } from '../shared/fecha-badge';

/** Una sección de la cartelera: el título de la categoría y sus eventos. */
interface SeccionCategoria {
  categoria: CategoriaEvento;
  eventos: Evento[];
}

/**
 * Cartelera de eventos (CU-001..CU-005). Sigue el patrón de las taquillas de
 * referencia: barra de búsqueda con filtros arriba, un evento destacado y el
 * resto agrupado por categoría.
 *
 * Los filtros se resuelven aquí en memoria porque hoy la cartelera completa
 * viene de EventosService (datos mock). Cuando exista el API Gateway, el
 * filtrado debe hacerse del lado del servidor —enviando ciudad/categoría/texto
 * como parámetros de consulta— para no traerse la cartelera entera al
 * navegador; la forma del componente no cambia, solo de dónde salen los datos.
 */
@Component({
  selector: 'app-eventos-lista',
  standalone: true,
  imports: [
    RouterLink,
    DecimalPipe,
    FormsModule,
    MatTabsModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule
  ],
  templateUrl: './eventos-lista.component.html',
  styleUrl: './eventos-lista.component.scss'
})
export class EventosListaComponent {
  private readonly eventosService = inject(EventosService);

  readonly fechaBadge = fechaBadge;
  readonly categorias = CATEGORIAS;
  readonly ciudades = this.eventosService.ciudades;

  readonly pestana = signal(0);
  readonly ciudad = signal('');
  readonly categoria = signal('');
  readonly texto = signal('');

  readonly hayFiltros = computed(
    () => this.ciudad() !== '' || this.categoria() !== '' || this.texto().trim() !== ''
  );

  /** Más próximos primero en "Próximos"; más recientes primero en "Pasados". */
  private readonly porPestana = computed(() => {
    const pasados = this.pestana() === 1;
    return this.eventosService
      .eventos()
      .filter((e) => e.pasado === pasados)
      .sort((a, b) => (pasados ? b.fecha.localeCompare(a.fecha) : a.fecha.localeCompare(b.fecha)));
  });

  readonly filtrados = computed(() => {
    const ciudad = this.ciudad();
    const categoria = this.categoria();
    const texto = this.texto().trim().toLowerCase();
    return this.porPestana().filter(
      (e) =>
        (ciudad === '' || e.ciudad === ciudad) &&
        (categoria === '' || e.categoria === categoria) &&
        (texto === '' ||
          e.nombre.toLowerCase().includes(texto) ||
          e.lugar.toLowerCase().includes(texto))
    );
  });

  /** Sin filtros activos, el primero se muestra en grande; con filtros, la grilla va plana. */
  readonly destacado = computed(() => (this.hayFiltros() ? undefined : this.filtrados()[0]));

  readonly secciones = computed<SeccionCategoria[]>(() => {
    const destacadoId = this.destacado()?.id;
    const resto = this.filtrados().filter((e) => e.id !== destacadoId);
    return this.categorias
      .map((categoria) => ({ categoria, eventos: resto.filter((e) => e.categoria === categoria) }))
      .filter((s) => s.eventos.length > 0);
  });

  limpiarFiltros(): void {
    this.ciudad.set('');
    this.categoria.set('');
    this.texto.set('');
  }
}
