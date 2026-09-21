import { PagosModule } from './pagos/pagos.module';
import { InventarioModule } from './inventario/inventario.module';
import { ExpiracionReservasService } from './inventario/expiracion-reservas.service';
import { Module } from '@nestjs/common';
import { CheckoutModule } from './checkout/checkout.module';
import { AutenticacionModule } from './comun/autenticacion/autenticacion.module';
import { CatalogoModule } from './catalogo/catalogo.module';
import { ConfigModule } from './config/config.module';
import { PersistenciaModule } from './persistencia/persistencia.module';
import { SaludController } from './salud/salud.controller';

@Module({
  imports: [ConfigModule, PersistenciaModule, CatalogoModule, AutenticacionModule, CheckoutModule, PagosModule, InventarioModule],
  providers: [ExpiracionReservasService],
  controllers: [SaludController],
})
export class AppModule {}
