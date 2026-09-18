import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { AuthService, ErrorCuenta } from '../core/auth.service';

/**
 * Perfil — CU-027C: *"el sistema valida los nuevos datos antes de
 * guardarlos"*. Solo el nombre es editable: el correo es la identidad de la
 * cuenta (DECISIONES.md §14 del servicio de Administración). Mismo criterio que
 * la pantalla de perfil de la app.
 */
@Component({
  selector: 'app-perfil',
  standalone: true,
  imports: [FormsModule, MatCardModule, MatFormFieldModule, MatInputModule, MatButtonModule, MatIconModule],
  templateUrl: './perfil.component.html',
  styleUrl: './perfil.component.scss'
})
export class PerfilComponent {
  private readonly auth = inject(AuthService);

  readonly usuario = this.auth.usuarioActual;
  nombre = this.usuario()?.nombre ?? '';
  readonly guardado = signal<string | null>(null);
  readonly error = signal<string | null>(null);
  readonly enviando = signal(false);

  async guardar(): Promise<void> {
    this.guardado.set(null);
    this.error.set(null);
    this.enviando.set(true);
    try {
      await this.auth.editarNombre(this.nombre);
      this.nombre = this.usuario()?.nombre ?? this.nombre;
      this.guardado.set('Perfil guardado.');
    } catch (error) {
      this.error.set(error instanceof ErrorCuenta ? error.message : 'No se pudo guardar.');
    } finally {
      this.enviando.set(false);
    }
  }
}
