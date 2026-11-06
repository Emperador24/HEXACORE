import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { TipoDecision } from '../../persistencia/entidades/decision.entity';

/** Paso 7: la decisión operativa que toma el supervisor. */
export class RegistrarDecisionDto {
  @ApiProperty({ enum: TipoDecision })
  @IsEnum(TipoDecision, { message: 'Tipo de decisión desconocido.' })
  tipo: TipoDecision;

  @ApiProperty({ example: 'Se mueven 2 personas de Parqueadero a Puerta Norte' })
  @IsString()
  @IsNotEmpty({ message: 'Describe la decisión.' })
  @MaxLength(1000)
  descripcion: string;

  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) zona?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) puntoAcceso?: string;
  /** CU-019C: la entrada que recibe a la gente al cerrar `puntoAcceso`. */
  @ApiPropertyOptional() @IsOptional() @IsString() @MaxLength(120) alternativa?: string;
  /** La alerta que motivó la decisión, si la hubo. */
  @ApiPropertyOptional() @IsOptional() @IsUUID() alertaId?: string;
}

export class ResultadoDecisionDto {
  @ApiProperty({ example: 'La fila bajó a 5 minutos' })
  @IsString()
  @IsNotEmpty({ message: 'Describe el resultado.' })
  @MaxLength(1000)
  resultado: string;
}
