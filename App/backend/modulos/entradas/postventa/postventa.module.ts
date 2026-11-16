import { Module } from '@nestjs/common';
import { ConfigModule } from './config/config.module';
import { PersistenciaModule } from './persistencia/persistencia.module';
import { ReventaModule } from './postventa/reventa.module';

/** Composición del componente existente de reventa dentro de Boletería. */
@Module({
  imports: [ConfigModule, PersistenciaModule, ReventaModule],
})
export class PostventaModule {}
