import { Component, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { TemaService } from '../core/tema.service';

/**
 * Esqueleto de las pantallas de cuenta (login, registro, activación,
 * recuperación): la marca arriba y una tarjeta de vidrio centrada con el
 * ícono, el título y la explicación — el mismo `LiquidGlassCard` de la app.
 */
@Component({
  selector: 'app-tarjeta-cuenta',
  standalone: true,
  imports: [RouterLink, MatIconModule, MatButtonModule],
  template: `
    <header class="cabecera">
      <a routerLink="/eventos" class="marca">HEXACORE</a>
      <button mat-icon-button (click)="tema.alternar()" [attr.aria-label]="tema.oscuro() ? 'Usar tema claro' : 'Usar tema oscuro'">
        <mat-icon>{{ tema.oscuro() ? 'light_mode' : 'dark_mode' }}</mat-icon>
      </button>
    </header>
    <main class="centro">
      <section class="tarjeta hxc-vidrio">
        <mat-icon class="icono">{{ icono() }}</mat-icon>
        <h1>{{ titulo() }}</h1>
        @if (explicacion()) {
          <p class="explicacion hxc-suave">{{ explicacion() }}</p>
        }
        <ng-content />
      </section>
    </main>
  `,
  styles: `
    .cabecera {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 18px 24px;
    }
    .marca {
      font-family: 'Space Grotesk', sans-serif;
      font-size: 1.4rem;
      font-weight: 700;
      letter-spacing: -0.4px;
      color: var(--hxc-tinta) !important;
      text-decoration: none;
    }
    .centro {
      min-height: calc(100vh - 90px);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 16px 16px 48px;
      box-sizing: border-box;
    }
    .tarjeta {
      width: min(440px, 100%);
      box-sizing: border-box;
      padding: 32px 28px;
      border-radius: var(--hxc-r-destacado);
      display: flex;
      flex-direction: column;
      align-items: stretch;
    }
    .icono {
      align-self: center;
      font-size: 56px;
      width: 56px;
      height: 56px;
      color: var(--hxc-primario-texto);
      margin-bottom: 14px;
    }
    h1 {
      text-align: center;
      font-size: 1.6rem;
    }
    .explicacion {
      text-align: center;
      margin: 8px 0 20px;
    }
  `
})
export class TarjetaCuentaComponent {
  readonly tema = inject(TemaService);
  readonly icono = input.required<string>();
  readonly titulo = input.required<string>();
  readonly explicacion = input<string>('');
}
