import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { AuthService, ErrorCuenta } from '../core/auth.service';
import { TemaService } from '../core/tema.service';
import { FuerzaContrasenaComponent } from '../shared/fuerza-contrasena.component';

/**
 * Ajustes — las mismas secciones que Ajustes en la app: preferencias (con el
 * modo oscuro), seguridad (cambiar contraseña, CU-027C), soporte y cerrar
 * sesión.
 */
@Component({
  selector: 'app-ajustes',
  standalone: true,
  imports: [
    FormsModule,
    MatCardModule,
    MatSlideToggleModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    MatIconModule,
    FuerzaContrasenaComponent
  ],
  templateUrl: './ajustes.component.html',
  styleUrl: './ajustes.component.scss'
})
export class AjustesComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  readonly tema = inject(TemaService);

  notificaciones = true;

  actual = '';
  nueva = '';
  confirmacion = '';
  readonly cambiando = signal(false);
  readonly mensajeContrasena = signal<string | null>(null);
  readonly errorContrasena = signal<string | null>(null);

  async cambiarContrasena(): Promise<void> {
    this.mensajeContrasena.set(null);
    this.errorContrasena.set(null);
    if (!this.actual) {
      this.errorContrasena.set('Ingresa tu contraseña actual.');
      return;
    }
    if (!this.nueva) {
      this.errorContrasena.set('Escribe tu contraseña nueva.');
      return;
    }
    if (this.nueva !== this.confirmacion) {
      this.errorContrasena.set('Las contraseñas no coinciden.');
      return;
    }
    this.cambiando.set(true);
    try {
      this.mensajeContrasena.set(await this.auth.cambiarContrasena(this.actual, this.nueva));
      this.actual = this.nueva = this.confirmacion = '';
    } catch (error) {
      // Si la cuenta se bloqueó, la sesión ya se cerró y la app va sola al login.
      this.errorContrasena.set(error instanceof ErrorCuenta ? error.message : 'No se pudo cambiar la contraseña.');
    } finally {
      this.cambiando.set(false);
    }
  }

  async cerrarSesion(): Promise<void> {
    await this.auth.cerrarSesion();
    await this.router.navigateByUrl('/login');
  }
}
