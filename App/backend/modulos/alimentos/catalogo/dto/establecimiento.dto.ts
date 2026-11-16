import { ApiProperty } from '@nestjs/swagger';
import { Establecimiento, EstadoEstablecimiento } from '../../persistencia/entidades/establecimiento.entity';

/** Datos del establecimiento que se muestran al seleccionar dónde pedir. */
export class EstablecimientoDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ format: 'uuid' }) eventoId: string;
  @ApiProperty({ example: 'Food Truck La Sazón' }) nombre: string;
  @ApiProperty({ enum: EstadoEstablecimiento }) estado: EstadoEstablecimiento;
  @ApiProperty({ example: 'Zona gastronómica - Módulo 4' }) puntoEntrega: string;
}

export function aEstablecimientoDto(establecimiento: Establecimiento): EstablecimientoDto {
  return {
    id: establecimiento.id,
    eventoId: establecimiento.eventoId,
    nombre: establecimiento.nombre,
    estado: establecimiento.estado,
    puntoEntrega: establecimiento.puntoEntrega,
  };
}
