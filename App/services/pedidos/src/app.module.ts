import { Module } from '@nestjs/common';
import { CatalogoModule } from './catalogo/catalogo.module';
import { ConfigModule } from './config/config.module';
import { PersistenciaModule } from './persistencia/persistencia.module';

@Module({
  imports: [ConfigModule, PersistenciaModule, CatalogoModule],
})
export class AppModule {}
