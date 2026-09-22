import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { AuthService, ErrorCuenta } from '../core/auth.service';

/**
 * Inicio de sesión — CU-027, contra el Servicio de Administración a través del
 * API Gateway.
 *
 * El mensaje de error lo pone el servidor: distingue credenciales incorrectas
 * de cuenta sin verificar, desactivada o bloqueada por intentos (CU-027D), y
 * repetirlo aquí sería tener dos versiones de la misma regla.
 */
@Component({
  selector: 'app-login',
  standalone: true,
  imports: [
    FormsModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatProgressBarModule
  ],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss'
})
export class LoginComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  correo = '';
  contrasena = '';
  readonly error = signal<string | null>(null);
  readonly entrando = signal(false);

  constructor() {
    // Si la sesión se cerró sola (caducó, la cerraron desde otro sitio, o le
    // quitaron el rol), aquí es donde la persona se entera del porqué.
    const motivo = this.auth.motivoCierre();
    if (motivo) {
      this.error.set(motivo);
      this.auth.motivoCierre.set(null);
    }
  }

  async ingresar(): Promise<void> {
    this.entrando.set(true);
    this.error.set(null);
    try {
      await this.auth.iniciarSesion(this.correo, this.contrasena);
      await this.router.navigateByUrl('/admin/inicio');
    } catch (e) {
      this.error.set(e instanceof ErrorCuenta ? e.message : 'No se pudo iniciar sesión.');
    } finally {
      this.entrando.set(false);
    }
  }
}
