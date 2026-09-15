import { Controller, Get } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Notificacion } from './entities/notificacion.entity.js';

/**
 * Expone la evidencia de mensajes procesados por el consumidor de
 * "turnos.cambios" — para demostrar en vivo la latencia publicación→consumo.
 */
@Controller('notificaciones')
export class NotificacionesController {
  constructor(
    @InjectRepository(Notificacion)
    private readonly notificaciones: Repository<Notificacion>,
  ) {}

  @Get()
  listar() {
    return this.notificaciones.find({ order: { recibidoEn: 'DESC' } });
  }
}
