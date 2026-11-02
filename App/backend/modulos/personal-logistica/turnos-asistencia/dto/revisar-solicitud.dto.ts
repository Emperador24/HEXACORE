import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString } from 'class-validator';

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
}
