import { IsBoolean, IsNotEmpty, IsString } from 'class-validator';

export class RevisarSolicitudDto {
  /**
   * Identificador del supervisor que revisa (aquí, su credencial/email —
   * no hay todavía un servicio de autenticación real que emita un id
   * propio de empleado en la sesión del cliente).
   */
  @IsString()
  @IsNotEmpty()
  supervisorId: string;

  @IsBoolean()
  aprobar: boolean;
}
