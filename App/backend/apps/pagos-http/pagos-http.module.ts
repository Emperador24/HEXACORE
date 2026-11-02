import { Module } from '@nestjs/common';
import { PagosModule } from '../../modulos/finanzas/pagos';
import { ConfigHttpModule } from './comun/config/config.module';
import { AutenticacionModule } from './comun/autenticacion/autenticacion.module';
import { RedisModule } from './comun/redis/redis.module';
import { RabbitMqModule } from './comun/rabbitmq/rabbitmq.module';
import { PublicadorPagos } from './eventos/publicador-pagos.service';
import { PagosController } from './pagos.controller';
import { WebhookController } from './webhook.controller';
import { SaludController } from './salud.controller';

/** Envoltura temporal: conserva el único servidor de Pagos y sus contratos actuales. */
@Module({
  imports: [ConfigHttpModule, PagosModule, RedisModule, RabbitMqModule, AutenticacionModule],
  controllers: [PagosController, WebhookController, SaludController],
  providers: [PublicadorPagos],
})
export class PagosHttpModule {}
