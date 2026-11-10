import { Module } from '@nestjs/common';
import { ConfigPagosModule } from './config/config.module';
import { PersistenciaModule } from './persistencia/persistencia.module';
import { PagosService } from './pagos.service';
import { CONFIGURACION, ConfiguracionServicio } from './config/configuracion';
import { PasarelaHttp } from './pasarela-http.service';
import { PasarelaStripe } from './pasarela-stripe.service';
import { PROCESADOR_PAGOS } from './procesador-pagos';

/** Libro y operaciones reutilizables. Importarlo no registra controladores ni clientes de sesión/mensajería. */
@Module({
  imports: [ConfigPagosModule, PersistenciaModule],
  providers: [
    PagosService,
    {
      // RNF-16: el proveedor se elige por configuración (PAGOS_PROVEEDOR) y
      // nada más cambia. Lo comparten Núcleo y Boletería.
      provide: PROCESADOR_PAGOS,
      inject: [CONFIGURACION],
      useFactory: (config: ConfiguracionServicio) =>
        config.pasarelaPagos.proveedor === 'stripe' ? new PasarelaStripe(config) : new PasarelaHttp(config),
    },
  ],
  exports: [PagosService, ConfigPagosModule],
})
export class PagosModule {}
