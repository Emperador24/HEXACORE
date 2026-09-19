import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { cargarClavePublica } from '../../comun/autenticacion/clave-publica.js';
import { proveedorRedis } from '../../comun/autenticacion/redis.provider.js';
import { SesionValida } from '../../comun/autenticacion/sesion-valida.guard.js';
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
    // Solo verificación: la clave privada la tiene el Servicio de
    // Administración y nadie más (ADR-11). El algoritmo se fija aquí y no se
    // lee del token, que es lo que cierra la puerta a `alg: none`.
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const { pem } = cargarClavePublica(config.get('NODE_ENV') === 'production');
        return {
          publicKey: pem,
          verifyOptions: { algorithms: ['RS256'], issuer: 'hexacore-administracion' },
        };
      },
    }),
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
    proveedorRedis,
    SesionValida,
    TurnosService,
    AsistenciaService,
    EventosPublicadorService,
    EventosConsumidorService,
  ],
})
export class TurnosAsistenciaModule {}
