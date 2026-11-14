import { UsePipes } from '@nestjs/common';
import { validacionLogistica } from '../../../compartido/validacion';
import { CONEXION_LOGISTICA } from '../persistencia/conexion';
import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SesionValida } from '../comun/autenticacion/sesion-valida.guard';
import { Notificacion } from './entities/notificacion.entity';
import { ContextoDeLogistica, PeticionDeLogistica } from './autorizacion.guard';

/**
 * Expone la evidencia de mensajes procesados por el consumidor de
 * "turnos.cambios" — para demostrar en vivo la latencia publicación→consumo.
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
  listar(@Req() peticion: PeticionDeLogistica) {
    // Igual que turnos/solicitudes/asistencia: sin ficha nunca se consulta todo.
    if (peticion.supervisa) return this.notificaciones.find({ order: { recibidoEn: 'DESC' } });
    if (!peticion.empleado) return Promise.resolve([]);
    return this.notificaciones.find({ where: { empleadoId: peticion.empleado.id }, order: { recibidoEn: 'DESC' } });
  }
}
