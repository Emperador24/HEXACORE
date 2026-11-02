import { Module } from '@nestjs/common';
import { PagosModule } from '../../../modulos/finanzas/pagos';
import { CONFIGURACION, cargarConfiguracionWebhook } from './configuracion-webhook';
import { PublicadorPagos } from './publicador-pagos.service';
import { WebhookController } from './webhook.controller';

/** Único receptor. Usa la conexión AMQP que ya pertenece al Núcleo. */
@Module({
  imports: [PagosModule],
  providers: [PublicadorPagos, { provide: CONFIGURACION, useFactory: cargarConfiguracionWebhook }],
  controllers: [WebhookController],
})
export class WebhookPagosModule {}
