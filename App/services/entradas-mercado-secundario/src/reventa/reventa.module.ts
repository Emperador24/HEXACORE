import { Module } from '@nestjs/common';
import { PersistenciaModule } from '../persistencia/persistencia.module';
import { CheckoutService } from './checkout.service';
import { GestorConcurrencia } from './concurrencia/gestor-concurrencia.service';
import { proveedorRedis } from './concurrencia/redis.provider';
import { ConexionRabbitMq } from './eventos/conexion-rabbitmq.service';
import { ConsumidorLiquidaciones } from './eventos/consumidor-liquidaciones.service';
import { ConsumidorNotificaciones } from './eventos/consumidor-notificaciones.service';
import { PublicadorEventos } from './eventos/publicador-eventos.service';
import { PasarelaHttp } from './pagos/pasarela-http.service';
import { PROCESADOR_PAGOS } from './pagos/procesador-pagos';
import { GeneradorQr } from './qr/generador-qr.service';
import { ExpiracionService } from './expiracion.service';
import { PublicacionService } from './publicacion.service';
import { ReventaController } from './reventa.controller';

/**
 * Mercado secundario de entradas (CU-006).
 *
 * Módulo propio y no mezclado con el resto del servicio: CU-001–005 son de
 * otra persona y llegarán como módulos hermanos. Esa separación es justo lo
 * que ADR-09 buscaba al elegir NestJS, y lo que hace cumplible RNF-13 (*"un
 * cambio en las reglas de un dominio no obliga a modificar otro"*).
 */
@Module({
  imports: [PersistenciaModule],
  controllers: [ReventaController],
  providers: [
    proveedorRedis,
    GestorConcurrencia,
    GeneradorQr,
    // El dominio depende de la interfaz, no de este adaptador concreto:
    // cambiar de proveedor de pagos es cambiar esta línea y escribir otra
    // implementación (RNF-16: "componentes a modificar: 1").
    { provide: PROCESADOR_PAGOS, useClass: PasarelaHttp },
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
  // GestorConcurrencia y ConexionRabbitMq se exportan para que la sonda de
  // vida (en AppModule) pueda preguntarles por sus dependencias.
  exports: [
    PublicacionService,
    CheckoutService,
    ExpiracionService,
    GestorConcurrencia,
    ConexionRabbitMq,
    PublicadorEventos,
  ],
})
export class ReventaModule {}
