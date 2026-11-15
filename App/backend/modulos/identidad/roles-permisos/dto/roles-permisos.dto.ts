import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { ACCIONES_PERMISO, AccionPermiso, MODULOS_PERMISO, ModuloPermiso } from '../../../../compartido/seguridad/permisos';

const recortar = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : value);
const MODULOS = Object.keys(MODULOS_PERMISO);

export class PermisoDto {
  @ApiProperty({ enum: MODULOS, example: 'parqueaderos' })
  @IsIn(MODULOS, { message: `El módulo debe ser uno de: ${MODULOS.join(', ')}` })
  modulo: ModuloPermiso;

  @ApiProperty({ enum: ACCIONES_PERMISO, example: 'leer' })
  @IsIn(ACCIONES_PERMISO, { message: `La acción debe ser una de: ${ACCIONES_PERMISO.join(', ')}` })
  accion: AccionPermiso;
}

/**
 * La matriz va como lista de pares y no como objeto de casillas: así cada par
 * se valida contra el catálogo, y un módulo que no existe es un 400 y no una
 * casilla que se ignora.
 */
class ConPermisos {
  @ApiProperty({ type: [PermisoDto], description: 'Al menos uno (paso 5). Los repetidos se cuentan una vez.' })
  @IsArray({ message: 'Los permisos deben ser una lista' })
  @ArrayMaxSize(Object.keys(MODULOS_PERMISO).length * ACCIONES_PERMISO.length)
  @ValidateNested({ each: true })
  @Type(() => PermisoDto)
  permisos: PermisoDto[];
}

export class CrearRolDto extends ConPermisos {
  @ApiProperty({ example: 'Supervisor de parqueadero', minLength: 3, maxLength: 40 })
  @Transform(recortar)
  @IsString({ message: 'Indica el nombre del rol' })
  @Length(3, 40, { message: 'El nombre debe tener entre 3 y 40 caracteres' })
  @Matches(/^[\p{L}\p{N} ._-]+$/u, { message: 'El nombre solo admite letras, números, espacios, punto, guion y guion bajo' })
  nombre: string;

  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @Transform(recortar)
  @IsString()
  @MaxLength(200, { message: 'La descripción no puede superar los 200 caracteres' })
  descripcion?: string;
}

/** El nombre no se cambia: es lo que llevan los tokens emitidos (ver DECISIONES.md §24). */
export class EditarRolDto extends ConPermisos {
  @ApiPropertyOptional({ maxLength: 200 })
  @IsOptional()
  @Transform(recortar)
  @IsString()
  @MaxLength(200, { message: 'La descripción no puede superar los 200 caracteres' })
  descripcion?: string;

  @ApiProperty({ description: 'La versión que se editó. Si otro la cambió antes, 409.', example: 1 })
  @IsInt({ message: 'Indica la versión del rol que editaste' })
  @Min(1)
  version: number;
}

export class EliminarRolDto {
  @ApiProperty({ example: 2 })
  @IsInt({ message: 'Indica la versión del rol que vas a eliminar' })
  @Min(1)
  version: number;

  @ApiPropertyOptional({ description: 'CU-028A: rol al que pasan sus usuarios antes de eliminarlo.' })
  @IsOptional()
  @IsUUID('4', { message: 'El rol de destino no es válido' })
  reasignarA?: string;
}

export class AsignarUsuarioDto {
  @ApiProperty({ example: 'ana@example.com' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value))
  @IsEmail({}, { message: 'Indica un correo válido' })
  email: string;
}

export class PermisoRespuestaDto {
  @ApiProperty() modulo: ModuloPermiso;
  @ApiProperty() accion: AccionPermiso;
}

export class RolDto {
  @ApiProperty() id: string;
  @ApiProperty() nombre: string;
  @ApiProperty() descripcion: string;
  @ApiProperty({ description: 'Los del sistema no se editan ni se eliminan.' }) delSistema: boolean;
  @ApiProperty() version: number;
  @ApiProperty({ type: [PermisoRespuestaDto] }) permisos: PermisoRespuestaDto[];
  @ApiProperty({ description: 'Cuentas activas con este rol.' }) usuarios: number;
  @ApiProperty() actualizadoEn: string;
}

export class CatalogoDto {
  @ApiProperty({ example: [{ id: 'parqueaderos', nombre: 'Parqueaderos' }] }) modulos: { id: string; nombre: string }[];
  @ApiProperty({ example: ACCIONES_PERMISO }) acciones: string[];
}

export class ListaRolesDto {
  @ApiProperty({ type: [RolDto] }) roles: RolDto[];
  @ApiProperty({ type: CatalogoDto }) catalogo: CatalogoDto;
}

export class UsuarioDeRolDto {
  @ApiProperty() id: string;
  @ApiProperty() nombre: string;
  @ApiProperty() email: string;
  @ApiProperty() estado: string;
  @ApiProperty() asignadoEn: string;
}

export class AuditoriaRolDto {
  @ApiProperty() accion: string;
  @ApiProperty() realizadaPor: string;
  @ApiProperty() detalle: Record<string, unknown>;
  @ApiProperty() fecha: string;
}

export class DetalleRolDto extends RolDto {
  @ApiProperty({ type: [UsuarioDeRolDto] }) asignados: UsuarioDeRolDto[];
  @ApiProperty({ type: [AuditoriaRolDto] }) auditoria: AuditoriaRolDto[];
}

export class MisPermisosDto {
  @ApiProperty({ example: ['Personal', 'Supervisor de parqueadero'] }) roles: string[];
  @ApiProperty({ type: [PermisoRespuestaDto] }) permisos: PermisoRespuestaDto[];
}
