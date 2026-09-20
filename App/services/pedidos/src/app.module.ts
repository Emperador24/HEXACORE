import { Module } from '@nestjs/common';
import { AutenticacionModule } from './comun/autenticacion/autenticacion.module';
import { CatalogoModule } from './catalogo/catalogo.module';
import { ConfigModule } from './config/config.module';
import { PersistenciaModule } from './persistencia/persistencia.module';

@Module({
  imports: [ConfigModule, PersistenciaModule, CatalogoModule, AutenticacionModule],
})
export class AppModule {}
