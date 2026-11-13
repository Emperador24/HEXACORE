import { UsePipes } from '@nestjs/common';
import { validacionLogistica } from '../../../compartido/validacion';
import { CONEXION_LOGISTICA } from '../persistencia/conexion';
import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SesionValida } from '../comun/autenticacion/sesion-valida.guard';
import { ContextoDeLogistica, PeticionDeLogistica } from './autorizacion.guard';
import { Notificacion } from './entities/notificacion.entity';

/**
 * Expone la evidencia de mensajes procesados por el consumidor de
 * "turnos.cambios" — para demostrar en vivo la latencia publicación→consumo.
 *
 * **F14:** cada aviso tiene un destinatario (`empleadoId`). Quien supervisa
 * ve todos, como antes; un empleado, solo los suyos. Antes cualquier sesión
 * válida recibía la lista completa, con turnos y nombres de los demás.
 */
@UsePipes(validacionLogistica)
@Controller('logistica/notificaciones')
@UseGuards(SesionValida, ContextoDeLogistica)
export class NotificacionesController {
  constructor(
    @InjectRepository(Notificacion, CONEXION_LOGISTICA)
    private readonly notificaciones: Repository<Notificacion>,
  ) {}

  @Get()
  async listar(@Req() peticion: PeticionDeLogistica) {
    if (peticion.supervisa) return this.notificaciones.find({ order: { recibidoEn: 'DESC' } });
    if (!peticion.empleado) return [];
    return this.notificaciones.find({ where: { empleadoId: peticion.empleado.id }, order: { recibidoEn: 'DESC' } });
  }
}
