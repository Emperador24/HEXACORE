import { ConfigModule } from './comun/config/config.module';
import { Module } from '@nestjs/common';
import { CatalogoModule } from './catalogo/catalogo.module';
import { CheckoutModule } from './checkout/checkout.module';
import { AutenticacionModule } from './comun/autenticacion/autenticacion.module';
import { ExpiracionReservasService } from './inventario/expiracion-reservas.service';
import { InventarioModule } from './inventario/inventario.module';
import { MenuModule } from './menu/menu.module';
import { PagosModule } from './pagos/pagos.module';
import { PersistenciaModule } from './persistencia/persistencia.module';
import { RecepcionModule } from './recepcion/recepcion.module';

/** API pública de alimentos en Núcleo. Conserva su base y sus reglas actuales. */
@Module({
  imports: [
    ConfigModule,
    PersistenciaModule,
    AutenticacionModule,
    CatalogoModule,
    MenuModule,
    CheckoutModule,
    PagosModule,
    InventarioModule,
    RecepcionModule,
  ],
  providers: [ExpiracionReservasService],
})
export class AlimentosModule {}
