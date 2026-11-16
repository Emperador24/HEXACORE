import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsNotEmpty, IsString, MaxLength, ValidateIf } from 'class-validator';

/** CU-007 paso 13 (confirmar) y CU-007B (rechazar, con motivo). */
export class ResponderAsignacionDto {
  @ApiProperty()
  @IsBoolean()
  aceptar: boolean;

  @ApiPropertyOptional({ example: 'Ese día tengo otro compromiso' })
  @ValidateIf((dto: ResponderAsignacionDto) => dto.aceptar === false)
  @IsString()
  @IsNotEmpty({ message: 'Para rechazar la asignación indica el motivo.' })
  @MaxLength(300)
  motivo?: string;
}
