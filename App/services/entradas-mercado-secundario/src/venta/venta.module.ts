import { Module } from '@nestjs/common';
import { EntradasInternasController } from './interno/entradas-internas.controller';
import { EntradasInternasService } from './interno/entradas-internas.service';
import { PersistenciaModule } from '../persistencia/persistencia.module';
import { ReventaModule } from '../reventa/reventa.module';
import { CancelacionService } from './cancelacion.service';
import { CompraService } from './compra.service';
import { ComprasController } from './compras.controller';
import { Contadores } from './contadores';
import { ExpiracionReservas } from './expiracion-reservas.service';
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
 * Separado de la cartelera (CU-005) a propósito: la cartelera no depende de
 * Redis, RabbitMQ ni la pasarela, y así sigue respondiendo aunque caigan.
 */
@Module({
  imports: [PersistenciaModule, ReventaModule],
  controllers: [ComprasController, EntradasInternasController],
  providers: [
    Contadores,
    NotificacionesVenta,
    PromocionesService,
    CompraService,
    ExpiracionReservas,
    CancelacionService,
    EntradasInternasService,
  ],
})
export class VentaModule {}
