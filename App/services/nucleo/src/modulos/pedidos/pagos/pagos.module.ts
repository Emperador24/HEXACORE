import { Module, OnModuleInit } from '@nestjs/common';
import { ConfirmChannel } from 'amqplib';
import { ConexionRabbitMq } from '../../../comun/rabbitmq/conexion-rabbitmq.service';
import { AutenticacionModule } from '../comun/autenticacion/autenticacion.module';
import { InventarioModule } from '../inventario/inventario.module';
import { PersistenciaModule } from '../persistencia/persistencia.module';
import {
  CLAVE_PEDIDO_CONFIRMADO,
  COLA_ESTABLECIMIENTOS,
  EXCHANGE_PEDIDOS,
} from './eventos/pedido-confirmado.evento';
import { PublicadorPedidos } from './eventos/publicador-pedidos.service';
import { PagosController } from './pagos.controller';
import { PagosService } from './pagos.service';
import { PasarelaHttp } from './pasarela-http.service';

/**
 * Pago del pedido (CU-012) y publicación del hecho `pedido.confirmado`.
 *
 * La conexión al broker la pone el Núcleo (`comun/rabbitmq`): aquí solo se
 * registra **esta** topología, independiente de la de cuentas.
 */
@Module({
  imports: [PersistenciaModule, AutenticacionModule, InventarioModule],
  controllers: [PagosController],
  providers: [PagosService, PasarelaHttp, PublicadorPedidos],
})
export class PagosModule implements OnModuleInit {
  constructor(private readonly conexion: ConexionRabbitMq) {}

  onModuleInit(): void {
    this.conexion.registrarTopologia(declararTopologiaPedidos);
  }
}

/** Crea el exchange y la cola de pedidos. Idempotente: se llama en cada canal nuevo. */
async function declararTopologiaPedidos(canal: ConfirmChannel): Promise<void> {
  await canal.assertExchange(EXCHANGE_PEDIDOS, 'topic', { durable: true });
  await canal.assertQueue(COLA_ESTABLECIMIENTOS, { durable: true });
  await canal.bindQueue(COLA_ESTABLECIMIENTOS, EXCHANGE_PEDIDOS, CLAVE_PEDIDO_CONFIRMADO);
}
