import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { SesionValida } from '../comun/autenticacion/sesion-valida.guard';
import { CONFIGURACION, ConfiguracionServicio } from '../config/configuracion';
import { PersistenciaModule } from '../persistencia/persistencia.module';
import { CheckoutService } from './checkout.service';
import { ClienteVentas } from './cliente-ventas.service';
import { GestorConcurrencia } from './concurrencia/gestor-concurrencia.service';
import { REDIS, proveedorRedis } from './concurrencia/redis.provider';
import { ConexionRabbitMq } from './eventos/conexion-rabbitmq.service';
import { ConsumidorLiquidaciones } from './eventos/consumidor-liquidaciones.service';
import { ConsumidorNotificaciones } from './eventos/consumidor-notificaciones.service';
import { PublicadorEventos } from './eventos/publicador-eventos.service';
import { ClientePagos } from './pagos/cliente-pagos.service';
import { PROCESADOR_PAGOS } from './pagos/procesador-pagos';
import { GeneradorQr } from './qr/generador-qr.service';
import { ExpiracionService } from './expiracion.service';
import { PublicacionService } from './publicacion.service';
import { ReventaController } from './reventa.controller';

/**
 * Mercado secundario de entradas (CU-006), el dominio de Postventa.
 *
 * Era un módulo dentro del servicio de Ventas; desde ADR-14 es el servicio
 * entero. Lo que antes compartía con la venta primaria —Redis, el adaptador de
 * pagos, el generador de QR— ya no se exporta a nadie: cada servicio tiene los
 * suyos. Lo que antes eran escrituras sobre `Entrada` ahora son llamadas a
 * `ClienteVentas`.
 */
@Module({
  imports: [
    PersistenciaModule,
    // Solo verifica: sin clave privada, este servicio no puede emitir tokens.
    // Se exporta porque SesionValida, que también se exporta, lo necesita.
    JwtModule.registerAsync({
      inject: [CONFIGURACION],
      useFactory: (config: ConfiguracionServicio) => ({
        publicKey: config.autenticacion.clavePublica.pem,
        // Algoritmo fijado: sin esto se aceptaría el que declare el propio
        // token, incluido `none` o un HS256 "firmado" con la clave pública.
        verifyOptions: { algorithms: ['RS256'], issuer: config.autenticacion.emisor },
      }),
    }),
  ],
  controllers: [ReventaController],
  providers: [
    proveedorRedis,
    SesionValida,
    ClienteVentas,
    GestorConcurrencia,
    GeneradorQr,
    // El dominio depende de la interfaz, no de este adaptador concreto:
    // cambiar de proveedor de pagos es cambiar esta línea y escribir otra
    // implementación (RNF-16: "componentes a modificar: 1").
    { provide: PROCESADOR_PAGOS, useClass: ClientePagos },
    ConexionRabbitMq,
    PublicadorEventos,
    // Los consumidores viven en este mismo servicio porque notificar y
    // liquidar son trabajos del propio dominio de Entradas. Lo que los
    // desacopla no es estar en otro proceso, sino que ocurren fuera del camino
    // de respuesta y con su propio reintento y DLQ.
    ConsumidorNotificaciones,
    ConsumidorLiquidaciones,
    PublicacionService,
    CheckoutService,
    ExpiracionService,
  ],
  // Solo lo que la sonda de vida (en AppModule) necesita preguntar. Ya no se
  // exportan REDIS, GeneradorQr ni PROCESADOR_PAGOS: los compartía con la
  // venta primaria cuando vivían en el mismo proceso, y eso se acabó.
  exports: [GestorConcurrencia, ConexionRabbitMq],
})
export class ReventaModule {}
