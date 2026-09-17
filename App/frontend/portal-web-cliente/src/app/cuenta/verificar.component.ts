import { Component, OnInit, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { AuthService, ErrorCuenta, tokenDeEnlace } from '../core/auth.service';
import { AyudaBuzonComponent } from '../shared/ayuda-buzon.component';
import { TarjetaCuentaComponent } from '../shared/tarjeta-cuenta.component';

/**
 * Activación de la cuenta — CU-027 pasos 5-7.
 *
 * Es el destino del enlace del correo (`/cuenta/verificar?token=…`). Con el
 * token en la URL basta pulsar el botón; **no se activa sola al abrirse**: hay
 * programas que abren los enlaces de los correos para revisarlos, y gastarían
 * el enlace antes de que llegue la persona. Sin token, se puede pegar.
 */
@Component({
  selector: 'app-verificar',
  standalone: true,
  imports: [FormsModule, RouterLink, MatFormFieldModule, MatInputModule, MatButtonModule, TarjetaCuentaComponent, AyudaBuzonComponent],
  template: `
    <app-tarjeta-cuenta
      icono="mark_email_read"
      [titulo]="token() ? 'Activa tu cuenta' : 'Revisa ' + (correo() || 'tu correo')"
      [explicacion]="token() ? 'Pulsa el botón para confirmar tu correo.' : (mensaje() || 'Te enviamos un enlace para activar tu cuenta. Ábrelo, o pégalo aquí.')"
    >
      <form (ngSubmit)="activar()">
        @if (!token()) {
          <mat-form-field appearance="outline" class="campo">
            <mat-label>Enlace del correo</mat-label>
            <textarea matInput name="enlace" rows="2" [(ngModel)]="enlace" data-prueba="verificar-enlace"></textarea>
          </mat-form-field>
        }
        @if (error()) {
          <p class="hxc-error" role="alert">{{ error() }}</p>
        }
        <button mat-flat-button color="primary" type="submit" class="principal" [disabled]="enviando()" data-prueba="verificar-activar">
          {{ enviando() ? 'Activando…' : 'Activar mi cuenta' }}
        </button>
      </form>
      @if (!token()) {
        <app-ayuda-buzon [correo]="correo() ?? ''" />
      }
      <a routerLink="/login" class="centrado">Volver a iniciar sesión</a>
    </app-tarjeta-cuenta>
  `,
  styles: `
    .campo { display: block; width: 100%; }
    .principal { width: 100%; height: 48px; margin-top: 8px; }
    .centrado { display: block; text-align: center; margin-top: 18px; font-weight: 600; text-decoration: none; }
  `
})
export class VerificarComponent implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly token = input<string>();
  readonly correo = input<string>();
  readonly mensaje = input<string>();

  enlace = '';
  readonly error = signal<string | null>(null);
  readonly enviando = signal(false);

  ngOnInit(): void {
    // El token no debe quedarse en la barra de direcciones ni en el historial.
    if (this.token()) history.replaceState(history.state, '', '/cuenta/verificar');
  }

  async activar(): Promise<void> {
    const token = this.token() ?? tokenDeEnlace(this.enlace);
    if (!token) {
      this.error.set('Pega el enlace completo que te llegó por correo.');
      return;
    }
    this.error.set(null);
    this.enviando.set(true);
    try {
      const aviso = await this.auth.verificar(token);
      await this.router.navigate(['/login'], { queryParams: { aviso } });
    } catch (error) {
      this.error.set(error instanceof ErrorCuenta ? error.message : 'No se pudo activar la cuenta.');
    } finally {
      this.enviando.set(false);
    }
  }
}
