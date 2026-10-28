import { ApiProperty } from '@nestjs/swagger';
import { Producto } from '../../persistencia/entidades/producto.entity';

/** Datos del producto que se muestran al consultar el menú. */
export class ProductoDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ format: 'uuid' }) establecimientoId: string;
  @ApiProperty({ example: 'Hamburguesa' }) nombre: string;
  @ApiProperty({ type: String, nullable: true }) descripcion: string | null;
  @ApiProperty({ example: '25000.00', description: 'Importe decimal representado como texto' }) precio: string;
  @ApiProperty() activo: boolean;
  @ApiProperty({ type: 'integer', minimum: 0, example: 20 }) cantidadInventario: number;
}

export function aProductoDto(producto: Producto): ProductoDto {
  return {
    id: producto.id,
    establecimientoId: producto.establecimientoId,
    nombre: producto.nombre,
    descripcion: producto.descripcion,
    precio: producto.precio,
    activo: producto.activo,
    cantidadInventario: producto.cantidadInventario,
  };
}
