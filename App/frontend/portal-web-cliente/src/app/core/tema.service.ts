import { DOCUMENT } from '@angular/common';
import { Injectable, inject, signal } from '@angular/core';

const CLAVE = 'hxc-tema';

/**
 * Tema claro u oscuro, como el interruptor "Modo oscuro" de Ajustes en la app.
 *
 * **Oscuro por defecto**, igual que la app (`_dark = true` en main.dart). La
 * preferencia se recuerda en `localStorage`: no es un dato sensible, y sin ella
 * cada visita volvería a empezar en oscuro.
 *
 * Se aplica con la clase `tema-oscuro` en `<html>`; styles.scss redefine ahí
 * todas las variables de color, y Material sigue a `color-scheme`.
 */
@Injectable({ providedIn: 'root' })
export class TemaService {
  private readonly documento = inject(DOCUMENT);
  private readonly _oscuro = signal(this.leer());
  readonly oscuro = this._oscuro.asReadonly();

  constructor() {
    this.aplicar(this._oscuro());
  }

  alternar(): void {
    this.usar(!this._oscuro());
  }

  /**
   * Cambia el tema y lo guarda **en el acto**. Con un `effect` se guardaba en
   * el siguiente ciclo, y recargar justo después del clic lo perdía.
   */
  usar(oscuro: boolean): void {
    this._oscuro.set(oscuro);
    this.aplicar(oscuro);
  }

  private aplicar(oscuro: boolean): void {
    this.documento.documentElement.classList.toggle('tema-oscuro', oscuro);
    try {
      localStorage.setItem(CLAVE, oscuro ? 'oscuro' : 'claro');
    } catch {
      // Almacenamiento bloqueado: el tema vale para esta visita.
    }
  }

  private leer(): boolean {
    try {
      return localStorage.getItem(CLAVE) !== 'claro';
    } catch {
      return true;
    }
  }
}
