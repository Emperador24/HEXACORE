import { Injectable, Module, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { CONEXION_EVENTOS } from './persistencia/conexion';
import { PersistenciaEventosModule } from './persistencia/persistencia.module';
import { EstadoEvento, Evento } from './persistencia/entidades/evento.entity';

export interface EventoParaAlimentos { id: string; nombre: string; disponible: boolean }

/** Lectura pública entre módulos. La regla del ciclo de vida permanece con Eventos. */
@Injectable()
export class ConsultaEventos {
  constructor(@InjectDataSource(CONEXION_EVENTOS) private readonly datos: DataSource) {}

  async paraAlimentos(id: string): Promise<EventoParaAlimentos> {
    const evento = await this.datos.getRepository(Evento).findOneBy({ id });
    if (!evento) throw new NotFoundException('No existe el evento');
    // Se permiten pedidos anticipados de eventos publicados, hasta su fin exclusivo.
    return { id: evento.id, nombre: evento.nombre,
      disponible: evento.estado === EstadoEvento.PUBLICADO && evento.fechaFin.getTime() > Date.now() };
  }
}

@Module({ imports: [PersistenciaEventosModule], providers: [ConsultaEventos], exports: [ConsultaEventos] })
export class ConsultaEventosModule {}
