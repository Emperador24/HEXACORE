import { Component, inject, ChangeDetectionStrategy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { TipoDecision } from '../core/models';
import { DatosDecision } from '../core/monitoreo-api.service';

export interface DatosDialogoDecision {
  tipo: TipoDecision;
  descripcion: string;
  zona?: string;
  puntoAcceso?: string;
  alternativa?: string;
  alertaId?: string;
  /** Texto de la alerta que motiva la decisión, si la hay. */
  motivo?: string;
  puntos: string[];
  zonas: string[];
}

/** Paso 7: registrar una decisión operativa. Cerrar un acceso exige elegir la entrada alternativa (CU-019C). */
@Component({
  selector: 'app-dialogo-decision',
  standalone: true,
  imports: [FormsModule, MatDialogModule, MatAutocompleteModule, MatButtonModule, MatFormFieldModule, MatInputModule, MatSelectModule],
  template: `
    <h2 mat-dialog-title>Registrar decisión</h2>
    <mat-dialog-content>
      @if (d.motivo) { <p class="motivo">{{ d.motivo }}</p> }
      <mat-form-field class="ancho">
        <mat-label>Tipo</mat-label>
        <mat-select [(ngModel)]="tipo">
          <mat-option value="REDISTRIBUIR_PERSONAL">Redistribuir personal</mat-option>
          <mat-option value="CERRAR_ACCESO">Cerrar un acceso (con alternativa)</mat-option>
          <mat-option value="HABILITAR_ACCESO">Habilitar un acceso</mat-option>
          <mat-option value="ESCALAR_INCIDENTE">Escalar un incidente</mat-option>
          <mat-option value="OTRA">Otra</mat-option>
        </mat-select>
      </mat-form-field>

      @if (tipo === 'CERRAR_ACCESO' || tipo === 'HABILITAR_ACCESO' || tipo === 'REDISTRIBUIR_PERSONAL') {
        <mat-form-field class="ancho">
          <mat-label>{{ tipo === 'REDISTRIBUIR_PERSONAL' ? 'Hacia el acceso o zona' : 'Acceso' }}</mat-label>
          <input matInput [(ngModel)]="puntoAcceso" [matAutocomplete]="puntos" />
          <mat-autocomplete #puntos="matAutocomplete">
            @for (p of opciones(); track p) { <mat-option [value]="p">{{ p }}</mat-option> }
          </mat-autocomplete>
          @if (tipo === 'HABILITAR_ACCESO') { <mat-hint>Puede ser una entrada nueva.</mat-hint> }
        </mat-form-field>
      }
      @if (tipo === 'CERRAR_ACCESO') {
        <mat-form-field class="ancho">
          <mat-label>Entrada alternativa</mat-label>
          <input matInput [(ngModel)]="alternativa" [matAutocomplete]="alternativas" required />
          <mat-autocomplete #alternativas="matAutocomplete">
            @for (p of d.puntos; track p) { @if (p !== puntoAcceso) { <mat-option [value]="p">{{ p }}</mat-option> } }
          </mat-autocomplete>
          <mat-hint>Se habilita si estaba cerrada.</mat-hint>
        </mat-form-field>
      }
      @if (tipo === 'REDISTRIBUIR_PERSONAL') {
        <mat-form-field class="ancho">
          <mat-label>Desde la zona</mat-label>
          <mat-select [(ngModel)]="zona">
            <mat-option value="">—</mat-option>
            @for (z of d.zonas; track z) { <mat-option [value]="z">{{ z }}</mat-option> }
          </mat-select>
        </mat-form-field>
      }
      <mat-form-field class="ancho">
        <mat-label>Descripción</mat-label>
        <textarea matInput rows="3" [(ngModel)]="descripcion" maxlength="1000" required></textarea>
        <mat-hint align="end">Queda en el historial del evento</mat-hint>
      </mat-form-field>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Volver</button>
      <button mat-flat-button [disabled]="!valido()" (click)="guardar()">Registrar</button>
    </mat-dialog-actions>
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
  styles: `.ancho { width: 100%; } .motivo { margin-top: 0; padding: 10px 12px; border-radius: 12px; background: var(--hx-hover); color: var(--hx-texto-2); }`
})
export class DialogoDecisionComponent {
  readonly d = inject<DatosDialogoDecision>(MAT_DIALOG_DATA);
  private readonly ref = inject(MatDialogRef<DialogoDecisionComponent, DatosDecision>);

  tipo: TipoDecision = this.d.tipo;
  descripcion = this.d.descripcion;
  puntoAcceso = this.d.puntoAcceso ?? '';
  alternativa = this.d.alternativa ?? '';
  zona = this.d.zona ?? '';

  opciones(): string[] {
    return this.tipo === 'REDISTRIBUIR_PERSONAL' ? [...this.d.puntos, ...this.d.zonas] : this.d.puntos;
  }

  valido(): boolean {
    if (!this.descripcion.trim()) return false;
    if (this.tipo === 'CERRAR_ACCESO') return !!this.puntoAcceso.trim() && !!this.alternativa.trim() && this.alternativa.trim() !== this.puntoAcceso.trim();
    if (this.tipo === 'HABILITAR_ACCESO') return !!this.puntoAcceso.trim();
    return true;
  }

  guardar(): void {
    this.ref.close({
      tipo: this.tipo,
      descripcion: this.descripcion.trim(),
      ...(this.puntoAcceso.trim() ? { puntoAcceso: this.puntoAcceso.trim() } : {}),
      ...(this.tipo === 'CERRAR_ACCESO' ? { alternativa: this.alternativa.trim() } : {}),
      ...(this.zona ? { zona: this.zona } : {}),
      ...(this.d.alertaId ? { alertaId: this.d.alertaId } : {})
    });
  }
}
