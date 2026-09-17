import { Component, input, isDevMode } from '@angular/core';
import { Servidor } from '../core/servidor';

/**
 * Solo en desarrollo: dónde están los correos. No se envían de verdad; los
 * recibe el simulador (`App/infra/correo-simulado`). En producción no aparece.
 */
@Component({
  selector: 'app-ayuda-buzon',
  standalone: true,
  template: `
    @if (desarrollo) {
      <p class="ayuda hxc-suave">
        Desarrollo: los correos no se envían de verdad. Ábrelos en
        <a [href]="enlace()" target="_blank" rel="noopener">el buzón simulado</a>.
      </p>
    }
  `,
  styles: `
    .ayuda {
      margin: 18px 0 0;
      font-size: 0.8rem;
      text-align: center;
    }
  `
})
export class AyudaBuzonComponent {
  readonly correo = input('');
  readonly desarrollo = isDevMode();
  enlace(): string {
    const correo = this.correo().trim();
    return correo ? `${Servidor.buzonDesarrollo}?para=${encodeURIComponent(correo)}` : Servidor.buzonDesarrollo;
  }
}
