import { Controller, Get, UseGuards } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SesionValida } from '../../comun/autenticacion/sesion-valida.guard.js';
import { Notificacion } from './entities/notificacion.entity.js';

/**
 * Expone la evidencia de mensajes procesados por el consumidor de
 * "turnos.cambios" — para demostrar en vivo la latencia publicación→consumo.
 */
@Controller('logistica/notificaciones')
@UseGuards(SesionValida)
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
