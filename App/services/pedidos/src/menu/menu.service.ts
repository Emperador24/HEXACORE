import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ProductoDto, aProductoDto } from '../catalogo/dto/producto.dto';
import { Establecimiento } from '../persistencia/entidades/establecimiento.entity';
import { Producto } from '../persistencia/entidades/producto.entity';

/** Administración mínima de la disponibilidad del menú (CU-012). */
@Injectable()
export class MenuService {
  constructor(@InjectDataSource() private readonly datos: DataSource) {}

  private async exigirEstablecimiento(establecimientoId: string): Promise<void> {
    if (!await this.datos.manager.exists(Establecimiento, { where: { id: establecimientoId } })) {
      throw new NotFoundException('No existe el establecimiento');
    }
  }

  async listar(establecimientoId: string): Promise<ProductoDto[]> {
    await this.exigirEstablecimiento(establecimientoId);
    const productos = await this.datos.manager.find(Producto, {
      where: { establecimientoId }, order: { nombre: 'ASC', id: 'ASC' },
    });
    return productos.map(aProductoDto);
  }

  async actualizar(establecimientoId: string, productoId: string, activo: boolean): Promise<ProductoDto> {
    await this.exigirEstablecimiento(establecimientoId);
    // UPDATE parcial: nunca reescribir precio ni inventario desde una lectura anterior.
    const resultado = await this.datos.getRepository(Producto).createQueryBuilder()
      .update(Producto).set({ activo })
      .where({ id: productoId, establecimientoId }).returning('*').execute();
    if (!resultado.affected) throw new NotFoundException('No existe el producto en este establecimiento');
    const fila = resultado.raw[0];
    return aProductoDto({
      id: fila.id, establecimientoId: fila.establecimiento_id, nombre: fila.nombre,
      descripcion: fila.descripcion, precio: fila.precio, activo: fila.activo,
      cantidadInventario: fila.cantidad_inventario,
    } as Producto);
  }
}
