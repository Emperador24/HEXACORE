import { ArgumentsHost, Catch, HttpStatus, Logger } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import { Response } from 'express';

/**
 * Señales de que el fallo es de **disponibilidad de la base**, no un error del
 * programa: se agotó la espera, se cayó la conexión o el servidor la rechazó.
 */
const MENSAJES = [
  /timeout exceeded when trying to connect/i,
  /query read timeout/i,
  /connection terminated/i,
  /statement timeout/i,
  /ECONNREFUSED|ECONNRESET|ETIMEDOUT/,
];
/** Códigos SQLSTATE: 57014 consulta cancelada, 57P0x servidor apagándose, 08xxx conexión. */
const CODIGOS = /^(57014|57P0\d|08\w{3})$/;

export function esFalloDeBase(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const conDriver = error as Error & { code?: string; driverError?: { code?: string; message?: string } };
  const codigo = conDriver.driverError?.code ?? conDriver.code;
  if (codigo && CODIGOS.test(codigo)) return true;
  const texto = `${error.message} ${conDriver.driverError?.message ?? ''}`;
  return MENSAJES.some((patron) => patron.test(texto));
}

/**
 * Una base caída o colgada se responde con **503**, rápido y en claro.
 *
 * Sin esto llegaba como un 500 genérico —"error del servidor", que invita a
 * pensar en un fallo del programa— o, antes de los límites de espera, no
 * llegaba nunca. 503 dice lo que pasa y es lo que un balanceador o un cliente
 * entienden como "prueba otra vez u otra instancia" (RNF-03).
 *
 * Todo lo demás sigue su curso normal.
 */
@Catch()
export class BaseNoDisponibleFilter extends BaseExceptionFilter {
  private readonly log = new Logger('Disponibilidad');

  catch(error: unknown, host: ArgumentsHost): void {
    if (!esFalloDeBase(error)) return super.catch(error, host);

    this.log.error(`PostgreSQL no disponible: ${(error as Error).message}`);
    host
      .switchToHttp()
      .getResponse<Response>()
      .status(HttpStatus.SERVICE_UNAVAILABLE)
      .setHeader('Retry-After', '5')
      .json({
        codigo: 'SERVICIO_NO_DISPONIBLE',
        mensaje: 'El servicio no está disponible en este momento. Inténtalo de nuevo en unos segundos.',
      });
  }
}
