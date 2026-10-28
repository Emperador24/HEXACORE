import { Module } from '@nestjs/common';
import { ConfigModule } from './comun/config/config.module';
import { RabbitMqModule } from './comun/rabbitmq/rabbitmq.module';
import { RedisModule } from './comun/redis/redis.module';
import { SaludController } from './comun/salud/salud.controller';
import { AdministracionModule } from './administracion.module';

/**
 * Microservicio de Autenticación (ADR-14): CU-027 a CU-032.
 *
 * Es lo que queda del Núcleo de ADR-12 después de la fase A: Alimentos salió a
 * su propio servicio de dominio y Notificaciones a su propio microservicio.
 *
 * Es microservicio por el criterio 2 con holgura —**lo usa toda petición del
 * sistema**— y por el 4: si se cae, nadie entra, así que su falla tiene que
 * quedar acotada y no arrastrar al resto. Y es el **único que firma tokens**;
 * los demás llevan solo la clave pública y pueden verificar pero no fabricar
 * (ADR-11).
 *
 * Al dejar de compartir proceso desapareció la razón de las conexiones
 * nombradas: una sola base, la conexión por defecto.
 */
@Module({
  imports: [ConfigModule, RedisModule, RabbitMqModule, AdministracionModule],
  controllers: [SaludController],
})
export class AppModule {}
