import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export const PRIORIDADES_INCIDENTE = ['BAJA', 'MEDIA', 'ALTA', 'CRITICA'] as const;
export type PrioridadIncidente = (typeof PRIORIDADES_INCIDENTE)[number];

export const ESTADOS_INCIDENTE = ['ABIERTO', 'EN_ATENCION', 'RESUELTO', 'CERRADO'] as const;
export type EstadoIncidente = (typeof ESTADOS_INCIDENTE)[number];

/** Paso 1: el personal registra el incidente ocurrido. */
export class RegistrarIncidenteDto {
  @ApiProperty({ example: 'Incendio en zona de comidas' })
  @IsString() @IsNotEmpty({ message: 'Indica el tipo de incidente.' }) @MaxLength(120)
  tipo: string;

  @ApiProperty({ example: 'Zona A, puesto de comidas 3' })
  @IsString() @IsNotEmpty({ message: 'Indica dónde ocurrió.' }) @MaxLength(300)
  ubicacion: string;

  @ApiProperty({ example: 'Se ve humo saliendo de la freidora' })
  @IsString() @IsNotEmpty({ message: 'Describe el incidente.' }) @MaxLength(2000)
  descripcion: string;
}

/** CU-020A: el supervisor reclasifica la prioridad. */
export class ReclasificarPrioridadDto {
  @ApiProperty({ enum: PRIORIDADES_INCIDENTE })
  @IsIn(PRIORIDADES_INCIDENTE, { message: `La prioridad debe ser una de: ${PRIORIDADES_INCIDENTE.join(', ')}.` })
  prioridad: PrioridadIncidente;
}

/** Paso 5: el supervisor asigna un responsable y coordina. */
export class AsignarResponsableDto {
  @ApiProperty() @IsUUID('all', { message: 'Indica el responsable asignado.' })
  responsableId: string;
}

/** Pasos 7-8: el responsable reporta el avance (o el cierre) del incidente. */
export class ReportarAvanceDto {
  @ApiProperty({ enum: ['EN_ATENCION', 'RESUELTO'] })
  @IsIn(['EN_ATENCION', 'RESUELTO'], { message: 'El avance debe ser EN_ATENCION o RESUELTO.' })
  estado: 'EN_ATENCION' | 'RESUELTO';

  @ApiPropertyOptional({ example: 'Bomberos ya están controlando el foco' })
  @IsOptional() @IsString() @MaxLength(1000)
  nota?: string;
}

/** CU-020B: cerrar directamente, sin escalar, con una nota de resolución. */
export class CerrarIncidenteDto {
  @ApiProperty({ example: 'Se apagó con el extintor; sin heridos ni daños' })
  @IsString() @IsNotEmpty({ message: 'Indica la nota de resolución.' }) @MaxLength(2000)
  notaResolucion: string;
}
