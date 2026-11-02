import { Module } from '@nestjs/common';
import { ComunModule } from './comun/comun.module';
import { ConfigModule } from './config/config.module';
import { PersistenciaModule } from './persistencia/persistencia.module';
import { VentaModule } from './venta/venta.module';

/** Composición del componente existente de ventas dentro de Boletería. */
@Module({
  imports: [
    ConfigModule,
    ComunModule,
    PersistenciaModule,
    VentaModule,
  ],
})
export class VentasModule {}
