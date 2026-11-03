import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

/** Desactivar a un empleado o cancelar una asignación exige decir por qué: queda auditado. */
export class MotivoDto {
  @ApiProperty({ example: 'Terminó su contrato' })
  @IsString()
  @IsNotEmpty({ message: 'Indica el motivo.' })
  @MaxLength(300)
  motivo: string;
}
