import { Component, inject, input, isDevMode, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { AuthService, ErrorCuenta } from '../core/auth.service';
import { TarjetaCuentaComponent } from '../shared/tarjeta-cuenta.component';

/** Inicio de sesión — CU-027 pasos 8-9. */
@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule, RouterLink, MatFormFieldModule, MatInputModule, MatButtonModule, MatIconModule, TarjetaCuentaComponent],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss'
})
export class LoginComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  /** A dónde volver tras iniciar sesión: lo pone el guard o el botón que trajo aquí. */
  readonly returnUrl = input<string>();
  /** Mensaje de una pantalla anterior (cuenta activada, contraseña cambiada…). */
  readonly aviso = input<string>();

  readonly desarrollo = isDevMode();
  correo = isDevMode() ? 'cliente@hexacore.com' : '';
  contrasena = '';
  readonly verContrasena = signal(false);
  readonly error = signal<string | null>(null);
  readonly sinVerificar = signal(false);
  readonly enviando = signal(false);

  /** Por qué se cerró la sesión, si se cerró sola. Se muestra una vez. */
  readonly motivoCierre = signal(this.auth.motivoCierre());

  constructor() {
    this.auth.motivoCierre.set(null);
  }

  async ingresar(): Promise<void> {
    if (!this.correo.trim() || !this.contrasena) {
      this.error.set('Ingresa tu correo y contraseña.');
      return;
    }
    this.error.set(null);
    this.sinVerificar.set(false);
    this.motivoCierre.set(null);
    this.enviando.set(true);
    try {
      await this.auth.iniciarSesion(this.correo, this.contrasena);
      const destino = this.returnUrl();
      // Solo rutas internas: un returnUrl ajeno sería una redirección abierta.
      await this.router.navigateByUrl(destino?.startsWith('/') && !destino.startsWith('//') ? destino : '/eventos');
    } catch (error) {
      const e = error instanceof ErrorCuenta ? error : null;
      this.error.set(e?.message ?? 'No se pudo iniciar sesión.');
      this.sinVerificar.set(e?.codigo === 'CUENTA_NO_VERIFICADA');
    } finally {
      this.enviando.set(false);
    }
  }
}
