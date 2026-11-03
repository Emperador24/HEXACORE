import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class RegistrarAsistenciaDto {
  /** Lo que se escanea en el punto de control: QR o NFC del carné. */
  @ApiProperty({ example: 'HXC-CARNET-00231' })
  @IsString()
  @IsNotEmpty()
  credencial: string;

  /**
   * Hora en que ocurrió realmente el registro en el punto de control.
   * Si se omite, se usa la hora del servidor al recibir la petición
   * (dispositivo en línea). Si el punto de control operó offline, debe
   * enviar aquí la hora local capturada en el momento del evento.
   */
  @ApiPropertyOptional({ example: '2026-09-17T13:05:00.000Z' })
  @IsOptional()
  @IsDateString()
  clientTimestamp?: string;

  /**
   * Clave generada por el dispositivo al crear el registro localmente
   * (offline-first). Un mismo idempotencyKey nunca produce dos registros:
   * permite reintentar la sincronización sin duplicar ni generar una
   * falsa anomalía de "registro duplicado".
   */
  @ApiPropertyOptional({ example: 'offline-3f1a2b' })
  @IsOptional()
  @IsString()
  idempotencyKey?: string;

  /**
   * Evento al que pertenece el turno que se está marcando. La asistencia
   * de un empleado no debe cruzarse entre eventos simultáneos: sin esto,
   * una salida podría cerrar por error la entrada de un evento distinto.
   * Opcional por compatibilidad con integraciones que no lo envían — en
   * ese caso se conserva el comportamiento previo (sin distinguir evento).
   */
  @ApiPropertyOptional({ example: 'evt-1' })
  @IsOptional()
  @IsString()
  eventoId?: string;
}
