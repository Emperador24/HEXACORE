import { IsDateString, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class RegistrarAsistenciaDto {
  @IsString()
  @IsNotEmpty()
  credencial: string;

  /**
   * Hora en que ocurrió realmente el registro en el punto de control.
   * Si se omite, se usa la hora del servidor al recibir la petición
   * (dispositivo en línea). Si el punto de control operó offline, debe
   * enviar aquí la hora local capturada en el momento del evento.
   */
  @IsOptional()
  @IsDateString()
  clientTimestamp?: string;

  /**
   * Clave generada por el dispositivo al crear el registro localmente
   * (offline-first). Un mismo idempotencyKey nunca produce dos registros:
   * permite reintentar la sincronización sin duplicar ni generar una
   * falsa anomalía de "registro duplicado".
   */
  @IsOptional()
  @IsString()
  idempotencyKey?: string;
}
