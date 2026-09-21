import { PagosModule } from './pagos/pagos.module';
import { Module } from '@nestjs/common';
import { CheckoutModule } from './checkout/checkout.module';
import { AutenticacionModule } from './comun/autenticacion/autenticacion.module';
import { CatalogoModule } from './catalogo/catalogo.module';
import { ConfigModule } from './config/config.module';
import { PersistenciaModule } from './persistencia/persistencia.module';

@Module({
  imports: [ConfigModule, PersistenciaModule, CatalogoModule, AutenticacionModule, CheckoutModule, PagosModule],
})
export class AppModule {}
