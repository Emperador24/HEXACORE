import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { CONFIGURACION, ConfiguracionServicio } from '../config/configuracion';
import { SesionValida } from './autenticacion/sesion-valida.guard';
import { GestorConcurrencia } from './concurrencia/gestor-concurrencia.service';
import { REDIS, proveedorRedis } from './concurrencia/redis.provider';
import { BandejaSalida } from './eventos/bandeja-salida.service';
import { ConexionRabbitMq } from './eventos/conexion-rabbitmq.service';
import { ClientePagos } from './pagos/cliente-pagos.service';
import { PROCESADOR_PAGOS } from './pagos/procesador-pagos';
import { GeneradorQr } from './qr/generador-qr.service';

/**
 * Infraestructura que comparten los casos de uso de este servicio.
 *
 * ## De dónde sale
 *
 * Estas piezas vivían dentro de `reventa/`, el módulo del CU-006, y
 * `VentaModule` las importaba de allí para no abrir conexiones propias. Al
 * salir Postventa a su propio servicio (ADR-14) ese módulo desapareció, y
 * dejarlas donde estaban habría significado importar de un módulo que ya no
 * existe.
 *
 * Están aquí, y no repartidas por caso de uso, porque la razón de compartirlas
 * nunca fue la reventa: es que **una conexión a Redis, una a RabbitMQ y un
 * adaptador de pagos por proceso** es lo correcto. Duplicarlas multiplicaría
 * las conexiones sin ganar nada.
 *
 * `@Global` porque casi todo las necesita y repetir el import en cada módulo no
 * aporta información.
 */
@Global()
@Module({
  imports: [
    // Solo verifica: sin clave privada, este servicio no puede emitir tokens.
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
  providers: [
    proveedorRedis,
    SesionValida,
    GestorConcurrencia,
    GeneradorQr,
    ConexionRabbitMq,
    BandejaSalida,
    // El dominio depende de la interfaz, no de este adaptador concreto:
    // cambiar de proveedor de pagos es cambiar esta línea y escribir otra
    // implementación (RNF-16: "componentes a modificar: 1").
    { provide: PROCESADOR_PAGOS, useClass: ClientePagos },
  ],
  exports: [
    REDIS,
    SesionValida,
    JwtModule,
    GestorConcurrencia,
    GeneradorQr,
    ConexionRabbitMq,
    BandejaSalida,
    PROCESADOR_PAGOS,
  ],
})
export class ComunModule {}
