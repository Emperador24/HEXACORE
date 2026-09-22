import { Module } from '@nestjs/common';
import { PersistenciaModule } from '../persistencia/persistencia.module';
import { ReventaModule } from '../reventa/reventa.module';
import { CancelacionService } from './cancelacion.service';
import { CompraService } from './compra.service';
import { ComprasController } from './compras.controller';
import { Contadores } from './contadores';
import { ExpiracionReservas } from './expiracion-reservas.service';
import { IngresoService } from './ingreso.service';
import { IngresosController } from './ingresos.controller';
import { NotificacionesVenta } from './notificaciones-venta.service';
import { PromocionesService } from './promociones.service';

/**
 * Venta primaria de entradas: CU-001 (compra), CU-002 (validar QR), CU-003
 * (cancelaciones) y CU-004 (promociones). Daniel Cristancho.
 *
 * Importa `ReventaModule` para **reutilizar** sus piezas de infraestructura —la
 * conexión a Redis y a RabbitMQ, el adaptador de la pasarela, el generador de
 * QR y la verificación de sesión— en vez de abrir conexiones propias. No usa
 * nada de la lógica de la reventa.
 *
 * Separado de `CatalogoModule` (CU-005) a propósito: la cartelera no depende de
 * Redis, RabbitMQ ni la pasarela, y así sigue respondiendo aunque caigan.
 */
@Module({
  imports: [PersistenciaModule, ReventaModule],
  controllers: [ComprasController, IngresosController],
  providers: [
    Contadores,
    NotificacionesVenta,
    PromocionesService,
    CompraService,
    ExpiracionReservas,
    CancelacionService,
    IngresoService,
  ],
})
export class VentaModule {}
