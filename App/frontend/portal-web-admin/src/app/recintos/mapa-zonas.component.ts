import { Component, ElementRef, input, output, signal, viewChild } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { ZonaEditable } from '../core/models';

type Arrastre = { indice: number; modo: 'mover' | 'redimensionar'; x0: number; y0: number; zona: { x: number; y: number; ancho: number; alto: number } };

/**
 * CU-029 paso 5: el plano con las zonas dibujadas encima. Cada zona colocada
 * es un rectángulo que se arrastra para moverlo y se agranda desde la esquina.
 * Las medidas van en % del plano, así no dependen del tamaño de la imagen ni
 * de la pantalla. Sin plano, se dibuja sobre una cuadrícula.
 */
@Component({
  selector: 'app-mapa-zonas',
  standalone: true,
  imports: [DecimalPipe],
  template: `
    <div #lienzo class="lienzo" [class.con-plano]="!!plano()" [style.aspect-ratio]="proporcion()">
      @if (plano(); as url) {
        <img [src]="url" alt="Plano del recinto" (load)="medir($event)" draggable="false" />
      }
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" (pointermove)="mover($event)" (pointerup)="soltar()" (pointerleave)="soltar()">
        @for (z of zonas(); track $index; let i = $index) {
          @if (z.x !== null && z.x !== undefined) {
            <g [class.elegida]="i === elegida()" (pointerdown)="tomar($event, i, 'mover')">
              <rect [attr.x]="z.x" [attr.y]="z.y" [attr.width]="z.ancho" [attr.height]="z.alto" rx="1.2"
                    [attr.fill]="z.color || '#2f6bff'" fill-opacity="0.28" [attr.stroke]="z.color || '#2f6bff'" stroke-width="0.4"
                    vector-effect="non-scaling-stroke" />
              @if (!soloLectura()) {
                <rect class="tirador" [attr.x]="z.x! + z.ancho! - 2.4" [attr.y]="z.y! + z.alto! - 2.4" width="2.4" height="2.4" rx="0.5"
                      [attr.fill]="z.color || '#2f6bff'" (pointerdown)="tomar($event, i, 'redimensionar')" />
              }
            </g>
          }
        }
      </svg>
      @for (z of zonas(); track $index; let i = $index) {
        @if (z.x !== null && z.x !== undefined) {
          <span class="etiqueta" [style.left.%]="z.x! + 1" [style.top.%]="z.y! + 1" [class.elegida]="i === elegida()">
            {{ z.nombre || 'Zona' }} · {{ z.capacidad | number }}
          </span>
        }
      }
    </div>
  `,
  styles: `
    .lienzo {
      position: relative;
      width: 100%;
      border-radius: 18px;
      overflow: hidden;
      border: 1px solid var(--hx-borde);
      background-color: var(--hx-superficie-2);
      background-image: linear-gradient(var(--hx-linea) 1px, transparent 1px), linear-gradient(90deg, var(--hx-linea) 1px, transparent 1px);
      background-size: 5% 5%;
      user-select: none;
      touch-action: none;
    }
    .lienzo.con-plano { background-image: none; }
    img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: fill; }
    svg { position: absolute; inset: 0; width: 100%; height: 100%; }
    g { cursor: move; }
    g.elegida rect:first-child { stroke-width: 0.9; fill-opacity: 0.4; }
    .tirador { cursor: nwse-resize; }
    .etiqueta {
      position: absolute;
      padding: 2px 8px;
      border-radius: 999px;
      background: rgb(0 0 0 / 0.55);
      color: #fff;
      font-size: 0.72rem;
      font-weight: 700;
      pointer-events: none;
      white-space: nowrap;
      max-width: 60%;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .etiqueta.elegida { background: var(--hx-primario); }
  `
})
export class MapaZonasComponent {
  readonly zonas = input.required<ZonaEditable[]>();
  readonly plano = input<string | null>(null);
  readonly elegida = input<number | null>(null);
  readonly soloLectura = input(false);
  readonly cambio = output<{ indice: number; zona: Pick<ZonaEditable, 'x' | 'y' | 'ancho' | 'alto'> }>();
  readonly elegir = output<number>();

  private readonly lienzo = viewChild.required<ElementRef<HTMLDivElement>>('lienzo');
  readonly proporcion = signal('16 / 10');
  private arrastre: Arrastre | null = null;

  /** Usa la proporción real del plano para que las zonas no se deformen. */
  medir(e: Event): void {
    const img = e.target as HTMLImageElement;
    if (img.naturalWidth && img.naturalHeight) this.proporcion.set(`${img.naturalWidth} / ${img.naturalHeight}`);
  }

  tomar(e: PointerEvent, indice: number, modo: Arrastre['modo']): void {
    e.stopPropagation();
    this.elegir.emit(indice);
    if (this.soloLectura()) return;
    const z = this.zonas()[indice];
    const p = this.punto(e);
    this.arrastre = { indice, modo, x0: p.x, y0: p.y, zona: { x: z.x!, y: z.y!, ancho: z.ancho!, alto: z.alto! } };
    (e.target as Element).setPointerCapture?.(e.pointerId);
  }

  mover(e: PointerEvent): void {
    if (!this.arrastre) return;
    const p = this.punto(e);
    const dx = p.x - this.arrastre.x0;
    const dy = p.y - this.arrastre.y0;
    const z = this.arrastre.zona;
    const r = (v: number) => Math.round(v * 10) / 10;
    const nueva =
      this.arrastre.modo === 'mover'
        ? { x: r(Math.min(Math.max(0, z.x + dx), 100 - z.ancho)), y: r(Math.min(Math.max(0, z.y + dy), 100 - z.alto)), ancho: z.ancho, alto: z.alto }
        : { x: z.x, y: z.y, ancho: r(Math.min(Math.max(4, z.ancho + dx), 100 - z.x)), alto: r(Math.min(Math.max(4, z.alto + dy), 100 - z.y)) };
    this.cambio.emit({ indice: this.arrastre.indice, zona: nueva });
  }

  soltar(): void {
    this.arrastre = null;
  }

  private punto(e: PointerEvent): { x: number; y: number } {
    const caja = this.lienzo().nativeElement.getBoundingClientRect();
    return { x: ((e.clientX - caja.left) / caja.width) * 100, y: ((e.clientY - caja.top) / caja.height) * 100 };
  }
}
