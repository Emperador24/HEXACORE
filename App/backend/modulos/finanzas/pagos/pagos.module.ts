import { Module } from '@nestjs/common';
import { ConfigPagosModule } from './config/config.module';
import { PersistenciaModule } from './persistencia/persistencia.module';
import { PagosService } from './pagos.service';
import { PasarelaHttp } from './pasarela-http.service';
import { PROCESADOR_PAGOS } from './procesador-pagos';

/** Libro y operaciones reutilizables. Importarlo no registra controladores ni clientes de sesión/mensajería. */
@Module({
  imports: [ConfigPagosModule, PersistenciaModule],
  providers: [PagosService, { provide: PROCESADOR_PAGOS, useClass: PasarelaHttp }],
  exports: [PagosService, ConfigPagosModule],
})
export class PagosModule {}
