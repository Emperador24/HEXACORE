import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { CONFIGURACION, ConfiguracionServicio } from '../config/configuracion';
import { NotificacionesModule } from '../notificaciones/notificaciones.module';
import { PersistenciaModule } from '../persistencia/persistencia.module';
import { AutenticacionService } from './autenticacion.service';
import { SesionRequerida } from './sesion-requerida.guard';
import { SesionesController } from './sesiones.controller';
import { proveedorRedis, REDIS, RevocacionesCompartidas } from './revocaciones-compartidas.service';
import { RenovacionService } from './renovacion.service';
import { SesionesService } from './sesiones.service';

/** Emisor de los tokens del sistema (CU-027 paso 9). */
export const EMISOR_TOKENS = 'hexacore-administracion';

@Module({
  imports: [
    PersistenciaModule,
    NotificacionesModule,
    JwtModule.registerAsync({
      inject: [CONFIGURACION],
      useFactory: (config: ConfiguracionServicio) => ({
        privateKey: config.jwt.clavePrivada,
        publicKey: config.jwt.clavePublica,
        signOptions: { algorithm: 'RS256', issuer: EMISOR_TOKENS },
        // El algoritmo se fija también al verificar. Sin esto, la librería
        // aceptaría el que declare la cabecera del propio token, y hay ataques
        // conocidos que se aprovechan justo de eso: `alg: none`, o un HS256
        // "firmado" usando la clave pública —que es pública— como secreto.
        verifyOptions: { algorithms: ['RS256'], issuer: EMISOR_TOKENS },
      }),
    }),
  ],
  controllers: [SesionesController],
  providers: [
    SesionesService,
    AutenticacionService,
    RenovacionService,
    SesionRequerida,
    proveedorRedis,
    RevocacionesCompartidas,
  ],
  // El guard se exporta para que los demás módulos (roles, CU-028) lo usen.
  // REDIS, para que la sonda de salud pueda preguntarle.
  exports: [SesionesService, AutenticacionService, SesionRequerida, REDIS],
})
export class SesionesModule {}
