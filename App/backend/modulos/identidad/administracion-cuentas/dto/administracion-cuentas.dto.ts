import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsInt, IsOptional, IsString, Length, Max, MaxLength, Min } from 'class-validator';
import { AccionCuenta } from '../../persistencia/entidades/auditoria-cuenta.entity';
import { EstadoCuenta } from '../../persistencia/entidades/usuario.entity';

const recortar = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class ConsultarCuentasDto {
  @ApiPropertyOptional({ description: 'Busca en el nombre y el correo.', maxLength: 100 })
  @IsOptional()
  @Transform(recortar)
  @IsString()
  @MaxLength(100, { message: 'La búsqueda no puede superar los 100 caracteres' })
  busqueda?: string;

  @ApiPropertyOptional({ enum: EstadoCuenta })
  @IsOptional()
  @IsEnum(EstadoCuenta, { message: 'Estado no válido' })
  estado?: EstadoCuenta;

  @ApiPropertyOptional({ default: false, description: 'Incluir las cuentas eliminadas (anonimizadas).' })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  incluirEliminadas?: boolean;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limite?: number;

  @ApiPropertyOptional({ default: 0, minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  desplazamiento?: number;
}

/** Por qué se toma la decisión. Obligatorio para desactivar y eliminar. */
export class MotivoObligatorioDto {
  @ApiProperty({ example: 'Reventa fraudulenta reportada por el organizador', minLength: 5, maxLength: 300 })
  @Transform(recortar)
  @IsString({ message: 'Indica el motivo' })
  @Length(5, 300, { message: 'El motivo debe tener entre 5 y 300 caracteres' })
  motivo: string;
}

export class MotivoOpcionalDto {
  @ApiPropertyOptional({ maxLength: 300 })
  @IsOptional()
  @Transform(recortar)
  @IsString()
  @MaxLength(300, { message: 'El motivo no puede superar los 300 caracteres' })
  motivo?: string;
}

export class CuentaAdministradaDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty() nombre: string;
  @ApiProperty() email: string;
  @ApiProperty({ enum: EstadoCuenta }) estado: EstadoCuenta;
  @ApiProperty({ example: ['Cliente'] }) roles: string[];
  @ApiProperty({ description: 'Eliminada (anonimizada). No puede reactivarse.' }) eliminada: boolean;
  @ApiProperty({ format: 'date-time', nullable: true, type: String }) verificadoEn: string | null;
  @ApiProperty({ format: 'date-time', nullable: true, type: String, description: 'CU-027D' })
  bloqueadaHasta: string | null;
  @ApiProperty({ format: 'date-time', nullable: true, type: String }) ultimoAccesoEn: string | null;
  @ApiProperty({ format: 'date-time' }) creadoEn: string;
}

export class PaginaCuentasDto {
  @ApiProperty() total: number;
  @ApiProperty({ type: [CuentaAdministradaDto] }) cuentas: CuentaAdministradaDto[];
}

export class EntradaAuditoriaDto {
  @ApiProperty({ enum: AccionCuenta }) accion: AccionCuenta;
  @ApiProperty({ enum: EstadoCuenta }) estadoAnterior: EstadoCuenta;
  @ApiProperty({ enum: EstadoCuenta }) estadoNuevo: EstadoCuenta;
  @ApiProperty({ description: 'Nombre del administrador que la realizó' }) realizadaPor: string;
  @ApiProperty({ nullable: true, type: String }) motivo: string | null;
  @ApiProperty() sesionesCerradas: number;
  @ApiProperty({ format: 'date-time' }) fecha: string;
}

export class DetalleCuentaDto extends CuentaAdministradaDto {
  @ApiProperty({ type: [EntradaAuditoriaDto], description: 'Las 20 acciones más recientes' })
  auditoria: EntradaAuditoriaDto[];
}
