import { Module } from '@nestjs/common';
import { ColaModule } from './cola/cola.module';
import { ConfigModule } from './comun/config/config.module';

/** Composición del componente existente de fila dentro de Boletería. */
@Module({
  imports: [ConfigModule, ColaModule],
})
export class FilaModule {}
