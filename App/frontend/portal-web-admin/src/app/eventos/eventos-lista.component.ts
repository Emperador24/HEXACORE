import { Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';
import { EventosService } from '../core/eventos.service';
import { EstadoEvento } from '../core/models';

/** CU-026 (Gestión de Eventos — CRUD): listado con acceso a crear/editar/eliminar. */
@Component({
  selector: 'app-eventos-lista',
  standalone: true,
  imports: [RouterLink, MatTableModule, MatButtonModule, MatIconModule, MatChipsModule],
  templateUrl: './eventos-lista.component.html',
  styleUrl: './eventos-lista.component.scss'
})
export class EventosListaComponent {
  private readonly eventosService = inject(EventosService);

  readonly eventos = this.eventosService.eventos;
  readonly columnas = ['nombre', 'fecha', 'recinto', 'aforo', 'estado', 'acciones'];

  eliminar(id: string): void {
    this.eventosService.eliminar(id);
  }

  etiquetaEstado(estado: EstadoEvento): string {
    const etiquetas: Record<EstadoEvento, string> = {
      [EstadoEvento.PLANIFICACION]: 'En planificación',
      [EstadoEvento.PUBLICADO]: 'Publicado',
      [EstadoEvento.EN_CURSO]: 'En curso',
      [EstadoEvento.FINALIZADO]: 'Finalizado',
      [EstadoEvento.CANCELADO]: 'Cancelado'
    };
    return etiquetas[estado];
  }
}
