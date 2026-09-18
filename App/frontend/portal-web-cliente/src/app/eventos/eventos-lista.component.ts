import { Component, computed, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { EventosService } from '../core/eventos.service';
import { CATEGORIAS, Evento } from '../core/models';
import { fechaBadge } from '../shared/fecha-badge';
import { COLOR, acento } from '../shared/acentos';

/** Filtros de fecha, los mismos de la app móvil (`_dateFilters`). */
type FiltroFecha = 'Todos' | 'Este mes' | 'Próximos 3 meses';
const FILTROS_FECHA: FiltroFecha[] = ['Todos', 'Este mes', 'Próximos 3 meses'];

/**
 * Cartelera de eventos (CU-001..CU-005) con el diseño "Liquid Glass" de la app
 * móvil: buscador, chips de categoría con acento rotativo, chips de fecha, un
 * destacado en tarjeta de vidrio y el resto en tarjetas con badge de fecha
 * tintado — ver app-movil/lib/main.dart (EventsPage).
 *
 * Los filtros se resuelven en memoria porque hoy la cartelera completa viene de
 * EventosService (datos mock). Con el API Gateway real deben pasar a ser
 * parámetros de consulta del servidor, para no traerse la cartelera entera.
 */
@Component({
  selector: 'app-eventos-lista',
  standalone: true,
  imports: [RouterLink, DecimalPipe, FormsModule, MatIconModule, MatButtonModule],
  templateUrl: './eventos-lista.component.html',
  styleUrl: './eventos-lista.component.scss'
})
export class EventosListaComponent {
  private readonly eventosService = inject(EventosService);

  readonly fechaBadge = fechaBadge;
  readonly acento = acento;
  readonly COLOR = COLOR;
  readonly categorias = ['Todas', ...CATEGORIAS];
  readonly filtrosFecha = FILTROS_FECHA;
  readonly ciudades = this.eventosService.ciudades;

  readonly categoria = signal<string>('Todas');
  readonly filtroFecha = signal<FiltroFecha>('Todos');
  readonly ciudad = signal('');
  readonly texto = signal('');

  readonly hayFiltros = computed(
    () =>
      this.categoria() !== 'Todas' ||
      this.filtroFecha() !== 'Todos' ||
      this.ciudad() !== '' ||
      this.texto().trim() !== ''
  );

  private coincideFecha(evento: Evento): boolean {
    const filtro = this.filtroFecha();
    if (filtro === 'Todos') return true;

    const fecha = new Date(`${evento.fecha}T00:00:00`);
    const hoy = new Date();
    if (filtro === 'Este mes') {
      return fecha.getFullYear() === hoy.getFullYear() && fecha.getMonth() === hoy.getMonth();
    }
    const limite = new Date(hoy.getFullYear(), hoy.getMonth() + 3, hoy.getDate());
    return fecha >= new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()) && fecha < limite;
  }

  private readonly filtrados = computed(() => {
    const ciudad = this.ciudad();
    const categoria = this.categoria();
    const texto = this.texto().trim().toLowerCase();
    return this.eventosService
      .eventos()
      .filter(
        (e) =>
          (ciudad === '' || e.ciudad === ciudad) &&
          (categoria === 'Todas' || e.categoria === categoria) &&
          (texto === '' ||
            e.nombre.toLowerCase().includes(texto) ||
            e.lugar.toLowerCase().includes(texto)) &&
          this.coincideFecha(e)
      );
  });

  /** Más próximos primero. */
  readonly proximos = computed(() =>
    this.filtrados()
      .filter((e) => !e.pasado)
      .sort((a, b) => a.fecha.localeCompare(b.fecha))
  );

  /** Más recientes primero. */
  readonly anteriores = computed(() =>
    this.filtrados()
      .filter((e) => e.pasado)
      .sort((a, b) => b.fecha.localeCompare(a.fecha))
  );

  readonly destacado = computed(() => this.proximos()[0]);
  readonly resto = computed(() => this.proximos().slice(1));
  readonly sinResultados = computed(() => this.filtrados().length === 0);

  limpiarFiltros(): void {
    this.categoria.set('Todas');
    this.filtroFecha.set('Todos');
    this.ciudad.set('');
    this.texto.set('');
  }
}
