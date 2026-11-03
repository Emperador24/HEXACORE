import { createHash } from 'node:crypto';

/**
 * SHA-256 de un código QR, en hexadecimal.
 *
 * Es lo único del código que sale de Ventas hacia la puerta: Acceso QR compara
 * hashes y el dispositivo de la puerta los descarga para validar sin red
 * (CU-002E). Ninguno de los dos necesita el código en claro.
 */
export function hashQr(codigo: string): string {
  return createHash('sha256').update(codigo).digest('hex');
}
