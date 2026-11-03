import { WebhookPagosModule } from './pagos/webhook-pagos.module';
import { PersonalLogisticaModule } from '../../modulos/personal-logistica/personal-logistica.module';
import { Module } from '@nestjs/common';
import { ConfiguracionProcesoModule } from '../../compartido/config/config.module';
import { RedisModule } from '../../compartido/redis/redis.module';
import { RabbitMqModule } from '../../compartido/rabbitmq/rabbitmq.module';
import { IdentidadModule } from '../../modulos/identidad/identidad.module';
import { AlimentosModule } from '../../modulos/alimentos/alimentos.module';
import { EventosRecintosModule } from '../../modulos/eventos-recintos/eventos-recintos.module';
import { SaludController } from './salud.controller';

@Module({
  imports: [WebhookPagosModule, ConfiguracionProcesoModule, RedisModule, RabbitMqModule, IdentidadModule, AlimentosModule, PersonalLogisticaModule, EventosRecintosModule],
  controllers: [SaludController],
})
export class NucleoModule {}
