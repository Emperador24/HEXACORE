import { Module } from '@nestjs/common';
import { EntradasInternasController } from './interno/entradas-internas.controller';
import { EntradasInternasService } from './interno/entradas-internas.service';
import { LlamadaInterna } from './interno/llamada-interna.guard';
import { PersistenciaModule } from '../persistencia/persistencia.module';
import { ComunModule } from '../comun/comun.module';
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
 * Importa `ComunModule` para **reutilizar** sus piezas de infraestructura —la
 * conexión a Redis y a RabbitMQ, el adaptador de la pasarela, el generador de
 * QR y la verificación de sesión— en vez de abrir conexiones propias. Antes las
 * tomaba de `ReventaModule`, que se fue con Postventa (ADR-14).
 *
 * Separado de la cartelera (CU-005) a propósito: la cartelera no depende de
 * Redis, RabbitMQ ni la pasarela, y así sigue respondiendo aunque caigan.
 */
@Module({
  imports: [PersistenciaModule, ComunModule],
  controllers: [ComprasController, EntradasInternasController],
  providers: [
    Contadores,
    NotificacionesVenta,
    PromocionesService,
    CompraService,
    ExpiracionReservas,
    CancelacionService,
    EntradasInternasService,
    LlamadaInterna,
  ],
})
export class VentaModule {}
