import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { CONEXION_ALIMENTOS } from '../persistencia/conexion';
import { ProductoDto } from '../catalogo/dto/producto.dto';
import { Establecimiento } from '../persistencia/entidades/establecimiento.entity';
import { Producto } from '../persistencia/entidades/producto.entity';
import { AjustesInventarioService } from '../inventario/ajustes-inventario.service';
import { LecturaInventarioService } from '../inventario/lectura-inventario.service';
import { GuardarProductoDto, RegistrarProductoDto, precioNormalizado } from './dto/guardar-producto.dto';

@Injectable()
export class MenuService {
  constructor(@InjectDataSource(CONEXION_ALIMENTOS) private readonly datos: DataSource,
    private readonly inventario: LecturaInventarioService, private readonly ajustes: AjustesInventarioService) {}
  listar(establecimientoId: string): Promise<ProductoDto[]> { return this.inventario.listar(establecimientoId); }

  async registrar(establecimientoId: string, actorId: string, clave: string, dto: RegistrarProductoDto) {
    const operacion = await this.ajustes.solicitar(establecimientoId, actorId, clave, { registro: dto });
    return { producto: (await this.listar(establecimientoId)).find(p => p.id === operacion.productoId), operacion };
  }
  async editar(establecimientoId: string, productoId: string, dto: GuardarProductoDto) {
    const precio = precioNormalizado(dto.precio);
    if (BigInt(precio.replace('.', '')) <= 0n) throw new BadRequestException('El precio debe ser mayor que cero.');
    try {
      await this.datos.transaction(async m => {
        if (!await m.findOne(Establecimiento, { where: { id: establecimientoId }, lock: { mode: 'pessimistic_write' } })) throw new NotFoundException('No existe el establecimiento');
        const r = await m.update(Producto, { id: productoId, establecimientoId }, {
          nombre: dto.nombre, descripcion: dto.descripcion ?? null, precio,
          restriccionesAlimentarias: dto.restriccionesAlimentarias, activo: dto.activo,
        });
        if (!r.affected) throw new NotFoundException('No existe el producto en este establecimiento');
      });
    } catch (e) {
      if ((e as { driverError?: { code?: string } }).driverError?.code === '23505') throw new ConflictException('El producto ya está registrado en este establecimiento.');
      throw e;
    }
    return (await this.listar(establecimientoId)).find(p => p.id === productoId)!;
  }
  async actualizar(establecimientoId: string, productoId: string, activo: boolean): Promise<ProductoDto> {
    await this.datos.transaction(async m => {
      if (!await m.findOne(Establecimiento, { where: { id: establecimientoId }, lock: { mode: 'pessimistic_write' } })) throw new NotFoundException('No existe el establecimiento');
      // UPDATE parcial: nunca reescribir precio ni físico desde una lectura anterior.
      const r = await m.getRepository(Producto).createQueryBuilder().update(Producto).set({ activo })
        .where({ id: productoId, establecimientoId }).execute();
      if (!r.affected) throw new NotFoundException('No existe el producto en este establecimiento');
    });
    return (await this.listar(establecimientoId)).find(p => p.id === productoId)!;
  }
}
