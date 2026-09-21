import { Module } from '@nestjs/common';
import { ConfigModule } from './config/config.module';
import { PersistenciaModule } from './persistencia/persistencia.module';

@Module({
  imports: [ConfigModule, PersistenciaModule],
})
export class AppModule {}
