import { Component, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { AuthService, ErrorCuenta } from '../core/auth.service';
import { AyudaBuzonComponent } from '../shared/ayuda-buzon.component';
import { TarjetaCuentaComponent } from '../shared/tarjeta-cuenta.component';

/**
 * Recuperación de contraseña — CU-027A: *"el sistema envía un enlace de
 * recuperación de un solo uso con expiración"*. El enlace lleva a
 * `/cuenta/restablecer`.
 */
@Component({
  selector: 'app-recuperar',
  standalone: true,
  imports: [FormsModule, RouterLink, MatFormFieldModule, MatInputModule, MatButtonModule, TarjetaCuentaComponent, AyudaBuzonComponent],
  template: `
    <app-tarjeta-cuenta
      icono="lock_reset"
      [titulo]="enviado() ? 'Revisa tu correo' : '¿Olvidaste tu contraseña?'"
      [explicacion]="enviado() ?? 'Ingresa tu correo y te enviaremos un enlace para elegir una nueva.'"
    >
      @if (!enviado()) {
        <form (ngSubmit)="enviar()">
          <mat-form-field appearance="outline" class="campo">
            <mat-label>Correo</mat-label>
            <input matInput name="correo" type="email" [(ngModel)]="direccion" autocomplete="email" data-prueba="recuperar-correo" />
          </mat-form-field>
          @if (error()) {
            <p class="hxc-error" role="alert">{{ error() }}</p>
          }
          <button mat-flat-button color="primary" type="submit" class="principal" [disabled]="enviando()" data-prueba="recuperar-enviar">
            {{ enviando() ? 'Enviando…' : 'Enviar enlace' }}
          </button>
        </form>
      } @else {
        <p class="hxc-suave centrado-texto">El enlace caduca pronto y solo sirve una vez.</p>
        <app-ayuda-buzon [correo]="direccion" />
      }
      <a routerLink="/login" class="centrado">Volver a iniciar sesión</a>
    </app-tarjeta-cuenta>
  `,
  styles: `
    .campo { display: block; width: 100%; }
    .principal { width: 100%; height: 48px; margin-top: 8px; }
    .centrado { display: block; text-align: center; margin-top: 18px; font-weight: 600; text-decoration: none; }
    .centrado-texto { text-align: center; margin: 0; }
  `
})
export class RecuperarComponent {
  private readonly auth = inject(AuthService);

  readonly correo = input<string>();
  direccion = '';
  readonly enviado = signal<string | null>(null);
  readonly error = signal<string | null>(null);
  readonly enviando = signal(false);

  ngOnInit(): void {
    this.direccion = this.correo() ?? '';
  }

  async enviar(): Promise<void> {
    if (!this.direccion.trim()) {
      this.error.set('Ingresa tu correo.');
      return;
    }
    this.error.set(null);
    this.enviando.set(true);
    try {
      // Responde lo mismo exista o no la cuenta: la pantalla no puede decir
      // "te lo enviamos" como si fuera seguro.
      this.enviado.set(await this.auth.solicitarRecuperacion(this.direccion));
    } catch (error) {
      this.error.set(error instanceof ErrorCuenta ? error.message : 'No se pudo enviar el enlace.');
    } finally {
      this.enviando.set(false);
    }
  }
}
