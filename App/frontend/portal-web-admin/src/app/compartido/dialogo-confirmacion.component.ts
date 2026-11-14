import { Component, inject, ChangeDetectionStrategy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';

export interface DatosConfirmacion {
  titulo: string;
  mensaje: string;
  /** Texto del botón que confirma. */
  accion: string;
  /** Pide un motivo obligatorio (queda auditado en el servidor). */
  pedirMotivo?: boolean;
  /** Acción que no se deshace sola o que afecta a otras personas. */
  peligrosa?: boolean;
}

/**
 * Confirmación antes de una acción con consecuencias. Reemplaza a `prompt()`:
 * explica qué va a pasar, exige el motivo cuando el servidor lo audita y no
 * deja confirmar con el motivo vacío.
 *
 * Devuelve el motivo (o `''` si no se pidió) al confirmar, y `undefined` al cancelar.
 */
@Component({
  selector: 'app-dialogo-confirmacion',
  standalone: true,
  imports: [FormsModule, MatDialogModule, MatButtonModule, MatFormFieldModule, MatInputModule],
  template: `
    <h2 mat-dialog-title>{{ datos.titulo }}</h2>
    <mat-dialog-content>
      <p>{{ datos.mensaje }}</p>
      @if (datos.pedirMotivo) {
        <mat-form-field class="motivo">
          <mat-label>Motivo</mat-label>
          <textarea matInput [(ngModel)]="motivo" rows="3" maxlength="300" cdkFocusInitial required></textarea>
          <mat-hint align="end">{{ motivo.length }}/300 · queda registrado</mat-hint>
        </mat-form-field>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Volver</button>
      <button
        mat-flat-button
        [class.peligro]="datos.peligrosa"
        [disabled]="datos.pedirMotivo && !motivo.trim()"
        (click)="confirmar()"
      >
        {{ datos.accion }}
      </button>
    </mat-dialog-actions>
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
  styles: `
    .motivo { width: 100%; margin-top: 8px; }
    p { margin-top: 0; color: var(--hx-texto-2); }
    .peligro:not(:disabled) { background: var(--hx-rojo) !important; color: #fff !important; box-shadow: 0 6px 18px color-mix(in srgb, var(--hx-rojo) 35%, transparent) !important; }
  `
})
export class DialogoConfirmacionComponent {
  readonly datos = inject<DatosConfirmacion>(MAT_DIALOG_DATA);
  private readonly ref = inject(MatDialogRef<DialogoConfirmacionComponent, string>);
  motivo = '';

  confirmar(): void {
    this.ref.close(this.datos.pedirMotivo ? this.motivo.trim() : '');
  }
}
