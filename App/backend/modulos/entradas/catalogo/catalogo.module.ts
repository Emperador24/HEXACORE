import { Module } from '@nestjs/common';
import { CarteleraModule } from './cartelera/cartelera.module';
import { ConfigModule } from './config/config.module';
import { PersistenciaModule } from './persistencia/persistencia.module';

/** Composición del componente existente de cartelera dentro de Boletería. */
@Module({
  imports: [ConfigModule, PersistenciaModule, CarteleraModule],
})
export class CatalogoModule {}
