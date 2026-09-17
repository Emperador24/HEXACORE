import { Component, computed, input } from '@angular/core';

/**
 * Medidor de fuerza de la contraseña — PasswordStrengthMeter de la app, con la
 * misma puntuación. Es solo una pista visual: la política la aplica el
 * servidor (RNF-14), y su mensaje es el que se muestra si la rechaza.
 */
@Component({
  selector: 'app-fuerza-contrasena',
  standalone: true,
  template: `
    @if (contrasena()) {
      <div class="medidor" [attr.aria-label]="'Fuerza: ' + nivel().etiqueta">
        @for (i of [0, 1, 2, 3]; track i) {
          <span class="barra" [style.background]="i < puntos() ? nivel().color : null"></span>
        }
        <span class="etiqueta" [style.color]="nivel().color">{{ nivel().etiqueta }}</span>
      </div>
    }
  `,
  styles: `
    .medidor {
      display: flex;
      align-items: center;
      gap: 4px;
      margin: -8px 0 12px;
    }
    .barra {
      flex: 1;
      height: 4px;
      border-radius: 2px;
      background: rgb(var(--hxc-texto-rgb) / 0.14);
      transition: background 0.2s;
    }
    .etiqueta {
      margin-left: 8px;
      font-size: 0.75rem;
      font-weight: 700;
      min-width: 44px;
    }
  `
})
export class FuerzaContrasenaComponent {
  readonly contrasena = input('');

  readonly puntos = computed(() => {
    const c = this.contrasena();
    return [c.length >= 8, /[A-Z]/.test(c), /[0-9]/.test(c), /[^A-Za-z0-9]/.test(c)].filter(Boolean).length;
  });

  readonly nivel = computed(() => {
    const p = this.puntos();
    if (p <= 1) return { color: '#ff5a5f', etiqueta: 'Débil' };
    if (p <= 3) return { color: '#ffb020', etiqueta: 'Media' };
    return { color: '#34c759', etiqueta: 'Fuerte' };
  });
}
