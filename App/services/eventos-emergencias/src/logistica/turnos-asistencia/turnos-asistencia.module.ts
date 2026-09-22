import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';
import { cargarClavePublica } from '../../comun/autenticacion/clave-publica.js';
import { proveedorRedis } from '../../comun/autenticacion/redis.provider.js';
import { SesionValida } from '../../comun/autenticacion/sesion-valida.guard.js';
import { AsistenciaController } from './asistencia.controller.js';
import {
  ContextoDeLogistica,
  SoloQuienSupervisa,
} from './autorizacion.guard.js';
import { AsistenciaService } from './asistencia.service.js';
import { Empleado } from './entities/empleado.entity.js';
import { Notificacion } from './entities/notificacion.entity.js';
import { RegistroAsistencia } from './entities/registro-asistencia.entity.js';
import { SolicitudCambioTurno } from './entities/solicitud-cambio-turno.entity.js';
import { Turno } from './entities/turno.entity.js';
import { ZonaEvento } from './entities/zona-evento.entity.js';
import { EventosConsumidorService } from './eventos-consumidor.service.js';
import { EventosPublicadorService } from './eventos-publicador.service.js';
import { NotificacionesController } from './notificaciones.controller.js';
import { PersonalOperativoController } from './personal-operativo.controller.js';
import { PersonalOperativoService } from './personal-operativo.service.js';
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
      ZonaEvento,
    ]),
    // Solo verifica tokens (RNF-06): sin clave privada, este servicio no
    // puede emitirlos. Ver App/shared/seguridad/token-sesion.md.
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        publicKey: cargarClavePublica(config.get('NODE_ENV') === 'production').pem,
        verifyOptions: {
          algorithms: ['RS256'],
          issuer: config.get('AUTH_JWT_EMISOR', 'hexacore-administracion'),
        },
      }),
    }),
  ],
  controllers: [
    TurnosController,
    AsistenciaController,
    NotificacionesController,
    PersonalOperativoController,
  ],
  providers: [
    proveedorRedis,
    SesionValida,
    // Guardias de logística: `ContextoDeLogistica` necesita el repositorio de
    // empleados, así que tiene que estar declarado aquí para que Nest se lo
    // inyecte.
    ContextoDeLogistica,
    SoloQuienSupervisa,
    TurnosService,
    AsistenciaService,
    PersonalOperativoService,
    EventosPublicadorService,
    EventosConsumidorService,
    proveedorRedis,
    SesionValida,
  ],
})
export class TurnosAsistenciaModule {}
