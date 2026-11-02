import { VentaModule } from '../../ventas/venta/venta.module';
import { API_VENTAS, ApiVentas } from '../../ventas/api-ventas';
import { Module } from '@nestjs/common';
import { CONFIGURACION, ConfiguracionServicio } from '../config/configuracion';
import { PersistenciaModule } from '../persistencia/persistencia.module';
import { CheckoutService } from './checkout.service';
import { ClienteVentas } from './cliente-ventas.service';
import { ConsumidorLiquidaciones } from './eventos/consumidor-liquidaciones.service';
import { ConsumidorNotificaciones } from './eventos/consumidor-notificaciones.service';
import { PublicadorEventos } from './eventos/publicador-eventos.service';
import { ExpiracionService } from './expiracion.service';
import { PublicacionService } from './publicacion.service';
import { ReventaController } from './reventa.controller';

/**
 * Mercado secundario (CU-006) dentro de Entradas. Conserva su base y usa la
 * interfaz local de Ventas; la infraestructura técnica pertenece al programa.
 */
@Module({
  imports: [PersistenciaModule, VentaModule],
  controllers: [ReventaController],
  providers: [
    {
      provide: ClienteVentas,
      inject: [CONFIGURACION, API_VENTAS],
      useFactory: (config: ConfiguracionServicio, api: ApiVentas) => new ClienteVentas(config, api),
    },
    PublicadorEventos,
    // Los consumidores viven en este mismo servicio porque notificar y
    // liquidar son trabajos del propio dominio de Entradas. Lo que los
    // desacopla no es estar en otro proceso, sino que ocurren fuera del camino
    // de respuesta y con su propio reintento y DLQ.
    ConsumidorNotificaciones,
    ConsumidorLiquidaciones,
    PublicacionService,
    CheckoutService,
    ExpiracionService,
  ],
})
export class ReventaModule {}
