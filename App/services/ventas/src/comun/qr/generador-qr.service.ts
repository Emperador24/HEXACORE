import { Injectable } from '@nestjs/common';
import { randomBytes } from 'node:crypto';

/**
 * Generador de QR (SAD §9).
 *
 * En la vista de componentes es el que *"invalida el código anterior y emite
 * uno nuevo"*. La invalidación no ocurre aquí: es el `UPDATE` de la entrada,
 * atómico, que hace el Servicio de Publicación. Este componente solo produce
 * el código nuevo — pero *cómo* lo produce es lo que sostiene la mitad de
 * seguridad del CU-006.
 */
@Injectable()
export class GeneradorQr {
  /**
   * Emite un código de ingreso nuevo.
   *
   * **Se usa `randomBytes` y no `Math.random()`.** El atributo de Seguridad del
   * CU-006 pide impedir *"la falsificación de códigos QR"*, y `Math.random()`
   * es un generador predecible: conocidas unas cuantas salidas se puede
   * reconstruir su estado y anticipar las siguientes. Con 12 bytes de entropía
   * criptográfica (96 bits) adivinar un código ajeno no es viable.
   *
   * El prototipo del portal usaba `HXC-QR-` + seis dígitos aleatorios: solo un
   * millón de combinaciones, y colisiones garantizadas mucho antes de llegar
   * ahí. Se conserva el prefijo para que los códigos sigan siendo reconocibles,
   * pero no el tamaño.
   *
   * La unicidad real la garantiza la restricción `UNIQUE` de `entradas.codigo_qr`:
   * si dos códigos coincidieran —lo que con 96 bits no va a pasar—, la
   * transferencia fallaría en vez de pisar la entrada de otra persona.
   */
  emitir(): string {
    return `HXC-QR-${randomBytes(12).toString('base64url')}`;
  }
}
