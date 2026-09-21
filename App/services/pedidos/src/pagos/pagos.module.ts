import { InventarioModule } from '../inventario/inventario.module';
import { ConexionRabbitMq } from './eventos/conexion-rabbitmq.service';
import { PublicadorPedidos } from './eventos/publicador-pedidos.service';
import { Module } from '@nestjs/common';
import { AutenticacionModule } from '../comun/autenticacion/autenticacion.module';
import { PersistenciaModule } from '../persistencia/persistencia.module';
import { PagosController } from './pagos.controller';
import { PagosService } from './pagos.service';
import { PasarelaHttp } from './pasarela-http.service';

@Module({
  imports: [PersistenciaModule, AutenticacionModule, InventarioModule],
  controllers: [PagosController],
  providers: [PagosService, PasarelaHttp, ConexionRabbitMq, PublicadorPedidos],
})
export class PagosModule {}
