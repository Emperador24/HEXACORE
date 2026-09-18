import { Component } from '@angular/core';

/**
 * Fondo con manchas de color difuminadas — AtmosphereBackground de la app.
 *
 * Son círculos de verdad con desenfoque, no degradados: es lo que da el color
 * intenso de la app. Van fijos detrás de todo, así que el contenido se
 * desplaza por encima sin arrastrarlos.
 *
 * En el móvil cada mancha mide 260-360 px en una pantalla de ~400 px, así que
 * aquí crecen con la ventana para conservar la proporción en un escritorio.
 */
@Component({
  selector: 'app-fondo-atmosfera',
  standalone: true,
  template: `
    <div class="mancha m1"></div>
    <div class="mancha m2"></div>
    <div class="mancha m3"></div>
    <div class="mancha m4"></div>
  `,
  styles: `
    :host {
      position: fixed;
      inset: 0;
      z-index: -1;
      overflow: hidden;
      background: var(--hxc-fondo);
      pointer-events: none;
      transition: background-color 0.25s ease;
    }
    .mancha {
      position: absolute;
      border-radius: 50%;
      filter: blur(70px);
      transition: background-color 0.25s ease;
    }
    .m1 {
      width: clamp(340px, 34vw, 620px);
      aspect-ratio: 1;
      left: -120px;
      top: -80px;
      background: var(--hxc-mancha-1);
    }
    .m2 {
      width: clamp(300px, 30vw, 540px);
      aspect-ratio: 1;
      right: -100px;
      top: 60px;
      background: var(--hxc-mancha-2);
    }
    .m3 {
      width: clamp(360px, 36vw, 660px);
      aspect-ratio: 1;
      left: -60px;
      bottom: -140px;
      background: var(--hxc-mancha-3);
    }
    .m4 {
      width: clamp(260px, 26vw, 480px);
      aspect-ratio: 1;
      right: -80px;
      bottom: 140px;
      background: var(--hxc-mancha-4);
    }
  `
})
export class FondoAtmosferaComponent {}
