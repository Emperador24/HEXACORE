import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { EventoReferencia } from '../persistencia/entidades/evento-referencia.entity';
import { Establecimiento, EstadoEstablecimiento } from '../persistencia/entidades/establecimiento.entity';
import { aEstablecimientoDto, EstablecimientoDto } from './dto/establecimiento.dto';
import { Producto } from '../persistencia/entidades/producto.entity';
import { aProductoDto, ProductoDto } from './dto/producto.dto';

/** Consultas del catálogo necesarias para iniciar CU-011. */
@Injectable()
export class CatalogoService {
  constructor(@InjectDataSource() private readonly fuenteDatos: DataSource) {}

  async listarProductos(establecimientoId: string): Promise<ProductoDto[]> {
    const establecimiento = await this.fuenteDatos.getRepository(Establecimiento).findOne({
      where: { id: establecimientoId },
    });
    if (!establecimiento) {
      throw new NotFoundException('No existe el establecimiento');
    }

    const productos = await this.fuenteDatos.getRepository(Producto).find({
      where: { establecimientoId, activo: true },
      order: { nombre: 'ASC', id: 'ASC' },
    });
    return productos.map(aProductoDto);
  }

  async listarEstablecimientos(eventoId: string): Promise<EstablecimientoDto[]> {
    const evento = await this.fuenteDatos.getRepository(EventoReferencia).findOne({
      where: { eventoId },
    });
    if (!evento) {
      throw new NotFoundException('No existe el evento');
    }
    if (!evento.disponible) return [];

    const establecimientos = await this.fuenteDatos.getRepository(Establecimiento).find({
      where: { eventoId, estado: EstadoEstablecimiento.DISPONIBLE },
      order: { nombre: 'ASC', id: 'ASC' },
    });
    return establecimientos.map(aEstablecimientoDto);
  }
}
