import { Component, computed, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ErrorCuenta } from '../core/auth.service';
import { RecintoResumen } from '../core/models';
import { RecintosApiService } from '../core/recintos-api.service';
import { acento } from '../compartido/acentos';

/** CU-029, paso 1: los recintos registrados, para abrir uno o registrar otro. */
@Component({
  selector: 'app-recintos-lista',
  standalone: true,
  imports: [DecimalPipe, FormsModule, RouterLink, MatButtonModule, MatFormFieldModule, MatIconModule, MatInputModule, MatProgressBarModule, MatTooltipModule],
  templateUrl: './recintos-lista.component.html',
  styleUrl: './recintos-lista.component.scss'
})
export class RecintosListaComponent {
  private readonly api = inject(RecintosApiService);

  readonly recintos = signal<RecintoResumen[]>([]);
  readonly cargando = signal(true);
  readonly error = signal<string | null>(null);
  readonly busqueda = signal('');
  readonly acento = acento;

  readonly visibles = computed(() => {
    const t = this.busqueda().trim().toLowerCase();
    return this.recintos().filter((r) => !t || [r.nombre, r.ciudad, r.direccion].some((v) => v?.toLowerCase().includes(t)));
  });

  constructor() {
    void this.cargar();
  }

  async cargar(): Promise<void> {
    this.cargando.set(true);
    this.error.set(null);
    try {
      this.recintos.set(await this.api.listar());
    } catch (e) {
      this.error.set(e instanceof ErrorCuenta ? e.message : 'No se pudieron cargar los recintos.');
    } finally {
      this.cargando.set(false);
    }
  }

  ocupacionZonas(r: RecintoResumen): number {
    return Math.min(100, Math.round((r.zonas.reduce((n, z) => n + z.capacidad, 0) / r.capacidad) * 100));
  }
}
