import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AsistenciaController } from './asistencia.controller.js';
import { AsistenciaService } from './asistencia.service.js';
import { Empleado } from './entities/empleado.entity.js';
import { Notificacion } from './entities/notificacion.entity.js';
import { RegistroAsistencia } from './entities/registro-asistencia.entity.js';
import { SolicitudCambioTurno } from './entities/solicitud-cambio-turno.entity.js';
import { Turno } from './entities/turno.entity.js';
import { EventosConsumidorService } from './eventos-consumidor.service.js';
import { EventosPublicadorService } from './eventos-publicador.service.js';
import { NotificacionesController } from './notificaciones.controller.js';
import { TurnosController } from './turnos.controller.js';
import { TurnosService } from './turnos.service.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Empleado,
      Turno,
      SolicitudCambioTurno,
      RegistroAsistencia,
      Notificacion,
    ]),
  ],
  controllers: [TurnosController, AsistenciaController, NotificacionesController],
  providers: [
    TurnosService,
    AsistenciaService,
    EventosPublicadorService,
    EventosConsumidorService,
  ],
})
export class TurnosAsistenciaModule {}
