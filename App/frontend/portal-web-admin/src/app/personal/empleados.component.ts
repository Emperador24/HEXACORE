import { Component, computed, inject, signal, ChangeDetectionStrategy } from '@angular/core';
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
import { Empleado, Rol } from '../core/models';
import { PersonalApiService } from '../core/personal-api.service';
import { PestanasPersonalComponent } from './pestanas-personal.component';
import { acento, iniciales } from '../compartido/acentos';

type FiltroEstado = 'activos' | 'inactivos' | 'todos';

/**
 * CU-007, pasos 1-2 y CU-007A: el listado de empleados registrados.
 *
 * La búsqueda y los filtros van en el navegador: el servicio entrega el
 * personal completo (decenas, no miles) y así la tabla responde al teclear.
 */
@Component({
  selector: 'app-empleados',
  standalone: true,
  imports: [
    FormsModule,
    RouterLink,
    MatButtonModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressBarModule,
    MatSelectModule,
    MatTableModule,
    MatTooltipModule,
    PestanasPersonalComponent
  ],
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './empleados.component.html'
})
export class EmpleadosComponent {
  private readonly api = inject(PersonalApiService);
  private readonly auth = inject(AuthService);

  readonly columnas = ['nombre', 'documento', 'rol', 'credencial', 'telefono', 'estado', 'acciones'];
  readonly empleados = signal<Empleado[]>([]);
  readonly acento = acento;
  readonly iniciales = iniciales;
  readonly cargando = signal(true);
  readonly error = signal<string | null>(null);

  readonly busqueda = signal('');
  readonly estado = signal<FiltroEstado>('activos');
  readonly rol = signal('');

  /** El alta vincula la ficha a una cuenta, y buscar cuentas es del Administrador (CU-027B). */
  readonly puedeDarDeAlta = computed(() => this.auth.roles().includes(Rol.ADMINISTRADOR));

  readonly roles = computed(() => [...new Set(this.empleados().map((e) => e.rol))].sort((a, b) => a.localeCompare(b)));

  readonly visibles = computed(() => {
    const texto = this.busqueda().trim().toLowerCase();
    return this.empleados().filter((e) => {
      if (this.estado() === 'activos' && !e.activo) return false;
      if (this.estado() === 'inactivos' && e.activo) return false;
      if (this.rol() && e.rol !== this.rol()) return false;
      if (!texto) return true;
      return [e.nombre, e.correo, e.documento, e.credencial].some((v) => v?.toLowerCase().includes(texto));
    });
  });

  readonly resumen = computed(() => {
    const todos = this.empleados();
    return { total: todos.length, activos: todos.filter((e) => e.activo).length };
  });

  constructor() {
    void this.cargar();
  }

  async cargar(): Promise<void> {
    this.cargando.set(true);
    this.error.set(null);
    try {
      this.empleados.set(await this.api.listar());
    } catch (e) {
      this.error.set(e instanceof ErrorCuenta ? e.message : 'No se pudo cargar el personal.');
    } finally {
      this.cargando.set(false);
    }
  }

  limpiarFiltros(): void {
    this.busqueda.set('');
    this.estado.set('todos');
    this.rol.set('');
  }
}
