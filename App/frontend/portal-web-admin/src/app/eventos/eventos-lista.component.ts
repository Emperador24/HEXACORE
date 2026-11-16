import { Component, computed, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { AuthService, ErrorCuenta } from '../core/auth.service';
import { EventosApiService } from '../core/eventos-api.service';
import { EstadoEvento, EventoResumen, Rol } from '../core/models';
import { estadoEvento } from './formato-eventos';
import { acento } from '../compartido/acentos';

/** CU-026, paso 1: los eventos con su estado, para crear uno nuevo o abrir uno existente. */
@Component({
  selector: 'app-eventos-lista',
  standalone: true,
  imports: [
    DatePipe, DecimalPipe, FormsModule, RouterLink, MatButtonModule, MatFormFieldModule, MatIconModule, MatInputModule,
    MatProgressBarModule, MatSelectModule, MatTableModule, MatTooltipModule
  ],
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './eventos-lista.component.html'
})
export class EventosListaComponent {
  private readonly api = inject(EventosApiService);
  private readonly auth = inject(AuthService);

  readonly columnas = ['nombre', 'fecha', 'recinto', 'cupos', 'estado', 'acciones'];
  readonly eventos = signal<EventoResumen[]>([]);
  readonly cargando = signal(true);
  readonly error = signal<string | null>(null);
  readonly busqueda = signal('');
  readonly estado = signal<EstadoEvento | ''>('');
  readonly estados = Object.values(EstadoEvento);
  readonly estadoEvento = estadoEvento;
  readonly acento = acento;

  /** Precondición 1: crear y editar es del Organizador; el Administrador solo consulta. */
  readonly esOrganizador = computed(() => this.auth.roles().includes(Rol.ORGANIZADOR));

  readonly visibles = computed(() => {
    const texto = this.busqueda().trim().toLowerCase();
    return this.eventos().filter(
      (e) =>
        (!this.estado() || e.estado === this.estado()) &&
        (!texto || [e.nombre, e.artista, e.categoria, e.recinto?.nombre].some((v) => v?.toLowerCase().includes(texto)))
    );
  });

  readonly conteo = computed(() => {
    const c = { BORRADOR: 0, PUBLICADO: 0, CANCELADO: 0 } as Record<EstadoEvento, number>;
    for (const e of this.eventos()) c[e.estado] += 1;
    return c;
  });

  constructor() {
    void this.cargar();
  }

  async cargar(): Promise<void> {
    this.cargando.set(true);
    this.error.set(null);
    try {
      this.eventos.set(await this.api.listar());
    } catch (e) {
      this.error.set(e instanceof ErrorCuenta ? e.message : 'No se pudieron cargar los eventos.');
    } finally {
      this.cargando.set(false);
    }
  }
}
