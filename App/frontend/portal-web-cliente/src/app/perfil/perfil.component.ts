import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { AuthService } from '../core/auth.service';

/**
 * Perfil del cliente: nombre es de solo lectura (lo define el sistema),
 * correo y teléfono se pueden cambiar aquí — mismo criterio que
 * PerfilScreen en app-movil-cliente (sin foto de perfil todavía: la carga
 * de archivos queda para cuando exista el API Gateway).
 */
@Component({
  selector: 'app-perfil',
  standalone: true,
  imports: [FormsModule, MatCardModule, MatFormFieldModule, MatInputModule, MatButtonModule],
  templateUrl: './perfil.component.html',
  styleUrl: './perfil.component.scss'
})
export class PerfilComponent {
  private readonly auth = inject(AuthService);

  readonly usuario = this.auth.usuarioActual;
  readonly correo = signal(this.usuario()?.correo ?? '');
  readonly telefono = signal(this.usuario()?.telefono ?? '');
  readonly guardado = signal(false);

  guardar(): void {
    this.auth.actualizarPerfil({ correo: this.correo(), telefono: this.telefono(), fotoUrl: this.usuario()?.fotoUrl ?? null });
    this.guardado.set(true);
  }
}
