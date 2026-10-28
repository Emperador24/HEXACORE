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

/**
 * Módulo de dominio **Pedidos** dentro del Núcleo (ADR-12).
 *
 * Cubre CU-011 (pedido de alimentos y bebidas) y CU-012 (pago del pedido).
 * CU-013..015 —preparación y entrega, validación en barra y gestión de
 * establecimientos— pertenecen a este mismo dominio y se añadirán como
 * submódulos hermanos.
 *
 * Este archivo es la **API pública del módulo**: el `AppModule` del Núcleo
 * importa solo esto, nunca los submódulos de adentro. La regla la verifica por
 * herramienta la tarjeta 20 (fronteras de módulo).
 *
 * Conserva su propia conexión a PostgreSQL —la base `pedidos`— y su propia
 * secuencia de migraciones, de modo que un cambio de esquema aquí sigue sin
 * tocar a Administración.
 *
 * `ExpiracionReservasService` es un **temporizador**: caduca las reservas de
 * inventario vencidas. Con una sola instancia del Núcleo corre una vez, que es
 * como corría antes. Antes de activar una segunda réplica hay que protegerlo
 * con un candado en Redis, o dos procesos caducarían las mismas reservas
 * (ADR-12, *Consecuencias*).
 */
@Module({
  imports: [
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
export class PedidosModule {}
