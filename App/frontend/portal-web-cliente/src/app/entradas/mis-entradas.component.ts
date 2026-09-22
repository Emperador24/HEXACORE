import { Component, OnInit, inject, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { EntradaPropia, ReventaService, mensajeDeError } from '../core/reventa.service';
import { COLOR } from '../shared/acentos';

/**
 * Mis entradas — el lado del vendedor del CU-006, contra el backend real.
 *
 * La lista viene del servidor, y con ella viene el **veredicto** de cada
 * entrada: `puedePublicarse` y `precioMaximo`. Esas dos decisiones no se
 * calculan aquí a propósito — dependen del estado de la entrada, de la ventana
 * de reventa y de las políticas del evento, que son reglas del dominio. Si la
 * pantalla las adivinara, ofrecería botones que el servidor va a rechazar.
 */
@Component({
  selector: 'app-mis-entradas',
  standalone: true,
  imports: [
    DecimalPipe,
    FormsModule,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressSpinnerModule
  ],
  templateUrl: './mis-entradas.component.html',
  styleUrl: './mis-entradas.component.scss'
})
export class MisEntradasComponent implements OnInit {
  private readonly reventa = inject(ReventaService);

  readonly COLOR = COLOR;

  readonly entradas = signal<EntradaPropia[]>([]);
  readonly cargando = signal(true);
  readonly error = signal<string | null>(null);
  readonly aviso = signal<string | null>(null);

  /** La entrada que se está publicando, y el precio tecleado. */
  readonly enPublicacion = signal<EntradaPropia | null>(null);
  readonly precio = signal<number | null>(null);
  readonly guardando = signal(false);

  ngOnInit(): void {
    this.cargar();
  }

  async cargar(): Promise<void> {
    this.cargando.set(true);
    this.error.set(null);
    try {
      this.entradas.set(await this.reventa.misEntradas());
    } catch (error) {
      this.error.set(mensajeDeError(error));
    } finally {
      this.cargando.set(false);
    }
  }

  etiquetaEstado(estado: string): string {
    const etiquetas: Record<string, string> = {
      VALIDA: 'Válida',
      EN_REVENTA: 'En reventa',
      TRANSFERIDA: 'Transferida',
      UTILIZADA: 'Utilizada',
      ANULADA: 'Anulada'
    };
    return etiquetas[estado] ?? estado;
  }

  colorEstado(estado: string): string {
    if (estado === 'EN_REVENTA') return COLOR.ambar;
    if (estado === 'VALIDA') return COLOR.verde;
    return COLOR.rosa;
  }

  abrirPublicacion(entrada: EntradaPropia): void {
    this.enPublicacion.set(entrada);
    // Se propone el precio original: es el punto de partida honesto, y deja
    // claro cuál es el tope sin que haya que calcularlo.
    this.precio.set(entrada.precioOriginal);
    this.aviso.set(null);
  }

  cerrarPublicacion(): void {
    this.enPublicacion.set(null);
    this.precio.set(null);
  }

  /** Pasos 1-4: el servidor valida propiedad, estado, ventana y tope. */
  async publicar(): Promise<void> {
    const entrada = this.enPublicacion();
    const precio = this.precio();
    if (!entrada || !precio || this.guardando()) return;

    this.guardando.set(true);
    this.error.set(null);
    try {
      await this.reventa.publicar(entrada.id, precio);
      this.cerrarPublicacion();
      this.aviso.set('Tu entrada ya está en el mercado de reventa.');
      await this.cargar();
    } catch (error) {
      this.error.set(mensajeDeError(error));
    } finally {
      this.guardando.set(false);
    }
  }

  /** CU-006B: retirar. El servidor la rechaza si alguien la tiene reservada. */
  async retirar(entrada: EntradaPropia): Promise<void> {
    if (!entrada.publicacionId) return;
    this.error.set(null);
    try {
      await this.reventa.retirar(entrada.publicacionId);
      this.aviso.set('La entrada volvió a ser tuya y ya no aparece en el mercado.');
      await this.cargar();
    } catch (error) {
      this.error.set(mensajeDeError(error));
    }
  }

  fechaEvento(iso: string): string {
    return new Intl.DateTimeFormat('es-CO', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    }).format(new Date(iso));
  }
}
