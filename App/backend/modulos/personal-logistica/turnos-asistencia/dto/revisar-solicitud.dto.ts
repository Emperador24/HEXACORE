import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class RevisarSolicitudDto {
  /**
   * El controlador SIEMPRE lo sobreescribe con el usuario de la sesión
   * (`SesionValida`) antes de llegar al servicio — de lo contrario cualquiera
   * podría aprobar su propio cambio declarándose supervisor en el cuerpo de
   * la petición. Queda opcional aquí solo para que la validación no rechace
   * una petición que no lo manda.
   */
  @ApiPropertyOptional({ readOnly: true })
  @IsOptional()
  @IsString()
  supervisorId?: string;

  @ApiProperty()
  @IsBoolean()
  aprobar: boolean;

  /**
   * CU-008, paso 7: el reemplazo que eligió el supervisor entre los posibles
   * (`GET solicitudes-cambio/:id/reemplazos`). Sin él se usa el que el
   * sistema propuso al registrar la solicitud.
   */
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('all', { message: 'reemplazoId debe ser el id de un empleado.' })
  reemplazoId?: string;

  /** CU-008A: por qué se rechaza; se le cuenta al empleado. */
  @ApiPropertyOptional({ example: 'No hay cobertura suficiente ese día' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  motivo?: string;
}
