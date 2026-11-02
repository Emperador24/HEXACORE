import { UsePipes } from '@nestjs/common';
import { validacionLogistica } from '../../../compartido/validacion';
import { CONEXION_LOGISTICA } from '../persistencia/conexion';
import { Controller, Get, UseGuards } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SesionValida } from '../comun/autenticacion/sesion-valida.guard';
import { Notificacion } from './entities/notificacion.entity';

/**
 * Expone la evidencia de mensajes procesados por el consumidor de
 * "turnos.cambios" — para demostrar en vivo la latencia publicación→consumo.
 */
@UsePipes(validacionLogistica)
@Controller('logistica/notificaciones')
@UseGuards(SesionValida)
export class NotificacionesController {
  constructor(
    @InjectRepository(Notificacion, CONEXION_LOGISTICA)
    private readonly notificaciones: Repository<Notificacion>,
  ) {}

  @Get()
  listar() {
    return this.notificaciones.find({ order: { recibidoEn: 'DESC' } });
  }
}
