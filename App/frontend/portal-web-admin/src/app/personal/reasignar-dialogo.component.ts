import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatRadioModule } from '@angular/material/radio';
import { ErrorCuenta } from '../core/auth.service';
import { Candidato, Turno } from '../core/models';
import { PersonalApiService } from '../core/personal-api.service';
import { aControles, desdeControles } from '../compartido/formato';

export interface DatosReasignacion {
  turno: Turno;
  rolRequerido: string;
}

/**
 * CU-007C: cambiar el horario de una asignación o pasarla a otro empleado
 * disponible. La consulta de candidatos excluye el propio turno, para que
 * mover la hora del mismo empleado no choque consigo mismo.
 *
 * Al cerrar devuelve el mensaje de éxito, o nada si se canceló.
 */
@Component({
  selector: 'app-reasignar-dialogo',
  standalone: true,
  imports: [FormsModule, MatDialogModule, MatButtonModule, MatFormFieldModule, MatIconModule, MatInputModule, MatProgressBarModule, MatRadioModule],
  template: `
    <h2 mat-dialog-title>Modificar asignación</h2>
    <mat-dialog-content>
      <p class="secundario">
        {{ datos.turno.zona }} · actualmente {{ datos.turno.empleado.nombre }}. Cambiar de persona u horario
        vuelve a pedir su confirmación.
      </p>

      <div class="horario">
        <mat-form-field><mat-label>Fecha</mat-label><input matInput type="date" [(ngModel)]="fecha" (change)="buscar()" /></mat-form-field>
        <mat-form-field><mat-label>Desde</mat-label><input matInput type="time" [(ngModel)]="inicio" (change)="buscar()" /></mat-form-field>
        <mat-form-field><mat-label>Hasta</mat-label><input matInput type="time" [(ngModel)]="fin" (change)="buscar()" /></mat-form-field>
      </div>

      @if (buscando()) { <mat-progress-bar mode="indeterminate" /> }
      @if (error()) {
        <div class="mensaje error"><mat-icon>error_outline</mat-icon><span>{{ error() }}</span></div>
      }

      <mat-radio-group [(ngModel)]="elegido" class="candidatos">
        @for (c of candidatos(); track c.empleado.id) {
          <mat-radio-button [value]="c.empleado.id" [disabled]="!c.disponible">
            <span class="nombre">{{ c.empleado.nombre }}</span>
            @if (c.empleado.id === datos.turno.empleadoId) { <span class="secundario"> (actual)</span> }
            <span class="secundario"> · {{ c.disponible ? c.horasEseDia.toFixed(1) + ' h ese día' : c.motivo }}</span>
          </mat-radio-button>
        } @empty {
          @if (!buscando()) { <p class="secundario">Nadie activo con el rol «{{ datos.rolRequerido }}».</p> }
        }
      </mat-radio-group>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Volver</button>
      <button mat-flat-button [disabled]="!elegido || guardando()" (click)="guardar()">
        {{ guardando() ? 'Guardando…' : 'Guardar cambio' }}
      </button>
    </mat-dialog-actions>
  `,
  styles: `
    .horario { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-top: 8px; }
    .candidatos { display: flex; flex-direction: column; gap: 2px; margin-top: 8px; }
    .nombre { font-weight: 500; }
    @media (max-width: 600px) { .horario { grid-template-columns: 1fr; } }
  `
})
export class ReasignarDialogoComponent implements OnInit {
  readonly datos = inject<DatosReasignacion>(MAT_DIALOG_DATA);
  private readonly ref = inject(MatDialogRef<ReasignarDialogoComponent, string>);
  private readonly api = inject(PersonalApiService);

  fecha = '';
  inicio = '';
  fin = '';
  elegido = '';
  readonly candidatos = signal<Candidato[]>([]);
  readonly buscando = signal(false);
  readonly guardando = signal(false);
  readonly error = signal<string | null>(null);

  ngOnInit(): void {
    const a = aControles(this.datos.turno.horaInicio);
    this.fecha = a.fecha;
    this.inicio = a.hora;
    this.fin = aControles(this.datos.turno.horaFin).hora;
    // Si la rechazó, no se le vuelve a proponer por defecto a la misma persona.
    this.elegido = this.datos.turno.confirmacion === 'RECHAZADA' ? '' : this.datos.turno.empleadoId;
    void this.buscar();
  }

  async buscar(): Promise<void> {
    const h = desdeControles(this.fecha, this.inicio, this.fin);
    if (!h || !this.datos.turno.zonaEventoId) return;
    this.buscando.set(true);
    this.error.set(null);
    try {
      this.candidatos.set(await this.api.candidatos(this.datos.turno.zonaEventoId, h.horaInicio, h.horaFin, this.datos.turno.id));
      if (!this.candidatos().some((c) => c.empleado.id === this.elegido && c.disponible)) this.elegido = '';
    } catch (e) {
      this.error.set(e instanceof ErrorCuenta ? e.message : 'No se pudo consultar el personal disponible.');
    } finally {
      this.buscando.set(false);
    }
  }

  async guardar(): Promise<void> {
    const h = desdeControles(this.fecha, this.inicio, this.fin);
    if (!h || !this.elegido) return;
    this.guardando.set(true);
    this.error.set(null);
    try {
      const { turno } = await this.api.reasignar(this.datos.turno.id, this.elegido, h.horaInicio, h.horaFin);
      this.ref.close(`Asignación actualizada: ${turno.empleado.nombre}, pendiente de su confirmación.`);
    } catch (e) {
      this.error.set(e instanceof ErrorCuenta ? e.message : 'No se pudo modificar la asignación.');
    } finally {
      this.guardando.set(false);
    }
  }
}
