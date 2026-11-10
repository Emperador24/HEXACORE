import { WebhookPagosModule } from './pagos/webhook-pagos.module';
import { PersonalLogisticaModule } from '../../modulos/personal-logistica/personal-logistica.module';
import { Module } from '@nestjs/common';
import { ConfiguracionProcesoModule } from '../../compartido/config/config.module';
import { RedisModule } from '../../compartido/redis/redis.module';
import { RabbitMqModule } from '../../compartido/rabbitmq/rabbitmq.module';
import { IdentidadModule } from '../../modulos/identidad/identidad.module';
import { AlimentosModule } from '../../modulos/alimentos/alimentos.module';
import { EventosRecintosModule } from '../../modulos/eventos-recintos/eventos-recintos.module';
import { OperacionModule } from '../../modulos/operacion/operacion.module';
import { ParqueaderosModule } from '../../modulos/parqueaderos/parqueaderos.module';
import { SaludController } from './salud.controller';
import { APP_FILTER } from '@nestjs/core';
import { DiagnosticoPgFilter } from './diagnostico-pg.filter';

@Module({
  imports: [WebhookPagosModule, ConfiguracionProcesoModule, RedisModule, RabbitMqModule, IdentidadModule, AlimentosModule, PersonalLogisticaModule, EventosRecintosModule, OperacionModule, ParqueaderosModule],
  controllers: [SaludController],
  providers: [{ provide: APP_FILTER, useClass: DiagnosticoPgFilter }],
})
export class NucleoModule {}
