import { Module } from '@nestjs/common';
import { AutenticacionModule } from '../comun/autenticacion/autenticacion.module';
import { PersistenciaModule } from '../persistencia/persistencia.module';
import { PagosController } from './pagos.controller';
import { PagosService } from './pagos.service';
import { PasarelaHttp } from './pasarela-http.service';
import { PROCESADOR_PAGOS } from './procesador-pagos';

/**
 * Pagos: el único punto del sistema que habla con la pasarela.
 *
 * Antes de ADR-14 el adaptador existía dos veces —en Entradas y en el módulo
 * de Pedidos— y había empezado a divergir: uno sabía reembolsar y el otro no.
 * Es la evidencia más concreta del criterio 2, y aquí deja de serlo.
 *
 * `PROCESADOR_PAGOS` se mantiene como puerto aunque ahora solo haya un
 * implementador: es lo que hace verificable el "1 componente a modificar" de
 * RNF-16 al cambiar de proveedor.
 */
@Module({
  imports: [PersistenciaModule, AutenticacionModule],
  controllers: [PagosController],
  providers: [PagosService, { provide: PROCESADOR_PAGOS, useClass: PasarelaHttp }],
})
export class PagosModule {}
