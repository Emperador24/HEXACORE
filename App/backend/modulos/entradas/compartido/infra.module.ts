import { CierreRedis } from './cierre-redis';
import { Global, Module, Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { CONFIGURACION_PROCESO } from '../../../compartido/config/configuracion';
import { proveedorRedis, REDIS } from '../../../compartido/redis/redis.module';
import { ConexionRabbitMq } from '../../../compartido/rabbitmq/conexion-rabbitmq.service';
import {
  CONFIGURACION_BOLETERIA,
  cargarConfiguracionBoleteria,
  ConfiguracionBoleteria,
} from './configuracion';
import { GestorConcurrencia } from './gestor-concurrencia.service';
import { SesionValida } from './sesion-valida.guard';
import { SesionValida as SesionEstricta } from './sesion-estricta.guard';
import { ClientePagos } from './cliente-pagos.service';
import { PROCESADOR_PAGOS } from './procesador-pagos';
import { GeneradorQr } from './generador-qr.service';
import { declararTopologiaReventa } from './topologia-reventa';

@Injectable()
class TopologiaReventa implements OnModuleInit {
  constructor(private readonly rabbit: ConexionRabbitMq) {}
  onModuleInit() {
    this.rabbit.registrarTopologia(declararTopologiaReventa);
  }
}
@Global()
@Module({
  imports: [
    ConfigModule.forRoot({
      ignoreEnvFile: process.env.NODE_ENV === 'production',
      cache: true,
    }),
    JwtModule.registerAsync({
      global: true,
      inject: [CONFIGURACION_BOLETERIA],
      useFactory: (c: ConfiguracionBoleteria) => ({
        publicKey: c.jwt.pem,
        verifyOptions: { algorithms: ['RS256'], issuer: c.emisor },
      }),
    }),
  ],
  providers: [
    {
      provide: CONFIGURACION_BOLETERIA,
      useFactory: cargarConfiguracionBoleteria,
    },
    {
      provide: CONFIGURACION_PROCESO,
      inject: [CONFIGURACION_BOLETERIA],
      useFactory: (c: ConfiguracionBoleteria) => c.proceso,
    },
    proveedorRedis,
    CierreRedis,
    ConexionRabbitMq,
    TopologiaReventa,
    GestorConcurrencia,
    SesionValida,
    SesionEstricta,
    GeneradorQr,
    { provide: PROCESADOR_PAGOS, useClass: ClientePagos },
  ],
  // CierreRedis es el único propietario que cierra el cliente, tras drenar trabajos.
  exports: [
    CONFIGURACION_BOLETERIA,
    CONFIGURACION_PROCESO,
    REDIS,
    ConexionRabbitMq,
    GestorConcurrencia,
    SesionValida,
    SesionEstricta,
    GeneradorQr,
    PROCESADOR_PAGOS,
    JwtModule,
  ],
})
export class InfraBoleteriaModule {}
