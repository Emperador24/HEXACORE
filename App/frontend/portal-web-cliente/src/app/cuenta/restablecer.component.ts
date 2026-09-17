import { Component, OnInit, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { AuthService, ErrorCuenta, tokenDeEnlace } from '../core/auth.service';
import { FuerzaContrasenaComponent } from '../shared/fuerza-contrasena.component';
import { TarjetaCuentaComponent } from '../shared/tarjeta-cuenta.component';

/**
 * Contraseña nueva con el enlace del correo — CU-027A. Destino de
 * `/cuenta/restablecer?token=…`. Al terminar, el servidor cierra todas las
 * sesiones de la cuenta.
 */
@Component({
  selector: 'app-restablecer',
  standalone: true,
  imports: [FormsModule, RouterLink, MatFormFieldModule, MatInputModule, MatButtonModule, TarjetaCuentaComponent, FuerzaContrasenaComponent],
  template: `
    <app-tarjeta-cuenta icono="password" titulo="Elige una contraseña nueva" explicacion="Cerraremos las sesiones abiertas en tus otros dispositivos.">
      <form (ngSubmit)="guardar()">
        @if (!token()) {
          <mat-form-field appearance="outline" class="campo">
            <mat-label>Enlace del correo</mat-label>
            <textarea matInput name="enlace" rows="2" [(ngModel)]="enlace"></textarea>
          </mat-form-field>
        }
        <mat-form-field appearance="outline" class="campo">
          <mat-label>Contraseña nueva</mat-label>
          <input matInput name="nueva" type="password" [(ngModel)]="nueva" autocomplete="new-password" data-prueba="restablecer-nueva" />
        </mat-form-field>
        <app-fuerza-contrasena [contrasena]="nueva" />
        <mat-form-field appearance="outline" class="campo">
          <mat-label>Confirmar contraseña</mat-label>
          <input matInput name="confirmacion" type="password" [(ngModel)]="confirmacion" autocomplete="new-password" data-prueba="restablecer-confirmacion" />
        </mat-form-field>
        @if (error()) {
          <p class="hxc-error" role="alert">{{ error() }}</p>
        }
        <button mat-flat-button color="primary" type="submit" class="principal" [disabled]="enviando()" data-prueba="restablecer-guardar">
          {{ enviando() ? 'Guardando…' : 'Guardar contraseña' }}
        </button>
      </form>
      <a routerLink="/login" class="centrado">Volver a iniciar sesión</a>
    </app-tarjeta-cuenta>
  `,
  styles: `
    .campo { display: block; width: 100%; }
    .principal { width: 100%; height: 48px; margin-top: 8px; }
    .centrado { display: block; text-align: center; margin-top: 18px; font-weight: 600; text-decoration: none; }
  `
})
export class RestablecerComponent implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly token = input<string>();
  enlace = '';
  nueva = '';
  confirmacion = '';
  readonly error = signal<string | null>(null);
  readonly enviando = signal(false);
  private tokenGuardado: string | null = null;

  ngOnInit(): void {
    this.tokenGuardado = this.token() ?? null;
    // Fuera de la barra de direcciones: el enlace da acceso a la cuenta.
    if (this.tokenGuardado) history.replaceState(history.state, '', '/cuenta/restablecer');
  }

  async guardar(): Promise<void> {
    const token = this.tokenGuardado ?? tokenDeEnlace(this.enlace);
    if (!token) {
      this.error.set('Pega el enlace completo que te llegó por correo.');
      return;
    }
    if (!this.nueva) {
      this.error.set('Escribe tu contraseña nueva.');
      return;
    }
    if (this.nueva !== this.confirmacion) {
      this.error.set('Las contraseñas no coinciden.');
      return;
    }
    this.error.set(null);
    this.enviando.set(true);
    try {
      const aviso = await this.auth.restablecer(token, this.nueva);
      await this.router.navigate(['/login'], { queryParams: { aviso } });
    } catch (error) {
      this.error.set(error instanceof ErrorCuenta ? error.message : 'No se pudo cambiar la contraseña.');
    } finally {
      this.enviando.set(false);
    }
  }
}
