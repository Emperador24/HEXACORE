import { Module } from '@nestjs/common';
import { ConfiguracionProcesoModule } from '../../compartido/config/config.module';
import { RedisModule } from '../../compartido/redis/redis.module';
import { RabbitMqModule } from '../../compartido/rabbitmq/rabbitmq.module';
import { IdentidadModule } from '../../modulos/identidad/identidad.module';
import { AlimentosModule } from '../../modulos/alimentos/alimentos.module';
import { SaludController } from './salud.controller';

@Module({
  imports: [ConfiguracionProcesoModule, RedisModule, RabbitMqModule, IdentidadModule, AlimentosModule],
  controllers: [SaludController],
})
export class NucleoModule {}
