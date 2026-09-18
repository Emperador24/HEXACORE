import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { AuthService, ErrorCuenta } from '../core/auth.service';
import { FuerzaContrasenaComponent } from '../shared/fuerza-contrasena.component';
import { TarjetaCuentaComponent } from '../shared/tarjeta-cuenta.component';

/**
 * Registro — CU-027 pasos 1-4. La cuenta nace con rol Cliente y sin activar.
 * La política de contraseñas la aplica el servidor (RNF-14): aquí solo se
 * comprueba lo que no depende de ninguna regla.
 */
@Component({
  selector: 'app-registro',
  standalone: true,
  imports: [
    FormsModule,
    RouterLink,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatCheckboxModule,
    TarjetaCuentaComponent,
    FuerzaContrasenaComponent
  ],
  template: `
    <app-tarjeta-cuenta
      icono="person_add"
      titulo="Únete a HEXACORE"
      explicacion="Compra entradas, reserva parqueadero y pide comida en un solo lugar."
    >
      <form (ngSubmit)="crear()">
        <mat-form-field appearance="outline" class="campo">
          <mat-label>Nombre completo</mat-label>
          <input matInput name="nombre" [(ngModel)]="nombre" autocomplete="name" data-prueba="registro-nombre" />
        </mat-form-field>
        <mat-form-field appearance="outline" class="campo">
          <mat-label>Correo</mat-label>
          <input matInput name="correo" type="email" [(ngModel)]="correo" autocomplete="email" data-prueba="registro-correo" />
        </mat-form-field>
        <mat-form-field appearance="outline" class="campo">
          <mat-label>Contraseña</mat-label>
          <input matInput name="contrasena" type="password" [(ngModel)]="contrasena" autocomplete="new-password" data-prueba="registro-contrasena" />
        </mat-form-field>
        <app-fuerza-contrasena [contrasena]="contrasena" />
        <mat-form-field appearance="outline" class="campo">
          <mat-label>Confirmar contraseña</mat-label>
          <input matInput name="confirmacion" type="password" [(ngModel)]="confirmacion" autocomplete="new-password" data-prueba="registro-confirmacion" />
        </mat-form-field>

        <mat-checkbox name="terminos" [(ngModel)]="aceptaTerminos" data-prueba="registro-terminos">
          Acepto los términos y la política de privacidad
        </mat-checkbox>

        @if (error()) {
          <p class="hxc-error" role="alert">{{ error() }}</p>
        }

        <button mat-flat-button color="primary" type="submit" class="principal" [disabled]="!aceptaTerminos || enviando()" data-prueba="registro-crear">
          {{ enviando() ? 'Creando…' : 'Crear cuenta' }}
        </button>
      </form>
      <a routerLink="/login" class="centrado">¿Ya tienes cuenta? Inicia sesión</a>
    </app-tarjeta-cuenta>
  `,
  styles: `
    .campo { display: block; width: 100%; }
    .principal { width: 100%; height: 48px; margin-top: 16px; }
    .centrado { display: block; text-align: center; margin-top: 18px; font-weight: 600; text-decoration: none; }
  `
})
export class RegistroComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  nombre = '';
  correo = '';
  contrasena = '';
  confirmacion = '';
  aceptaTerminos = false;
  readonly error = signal<string | null>(null);
  readonly enviando = signal(false);

  async crear(): Promise<void> {
    if (!this.nombre.trim() || !this.correo.trim() || !this.contrasena) {
      this.error.set('Completa tu nombre, correo y contraseña.');
      return;
    }
    if (this.contrasena !== this.confirmacion) {
      this.error.set('Las contraseñas no coinciden.');
      return;
    }
    this.error.set(null);
    this.enviando.set(true);
    try {
      const mensaje = await this.auth.registrar(this.nombre, this.correo, this.contrasena);
      await this.router.navigate(['/cuenta/verificar'], { queryParams: { correo: this.correo.trim(), mensaje } });
    } catch (error) {
      this.error.set(error instanceof ErrorCuenta ? error.message : 'No se pudo crear la cuenta.');
    } finally {
      this.enviando.set(false);
    }
  }
}
