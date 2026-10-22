import { Module } from '@nestjs/common';
import { ConfigModule } from './comun/config/config.module';
import { RabbitMqModule } from './comun/rabbitmq/rabbitmq.module';
import { RedisModule } from './comun/redis/redis.module';
import { SaludController } from './comun/salud/salud.controller';
import { AdministracionModule } from './modulos/administracion/administracion.module';
import { PedidosModule } from './modulos/pedidos/pedidos.module';

/**
 * Núcleo — servicio de dominio agregado (ADR-12).
 *
 * Una sola unidad desplegable que agrupa varios dominios como **módulos**, en
 * lugar de un microservicio por dominio. Cada módulo conserva su esquema de
 * datos, su `data-source` y su propia secuencia de migraciones, de modo que un
 * cambio de esquema en uno sigue sin tocar a los demás.
 *
 * Módulos:
 *   - Administración — CU-027..032 · base `administracion`
 *   - Pedidos        — CU-011..015 · base `pedidos`
 *   - Personal       — CU-007..009 · sin implementar
 *   - Parqueaderos   — CU-021..025 · sin implementar
 *
 * En `comun/` vive lo que comparten todos: la configuración del proceso, el
 * cliente de Redis, la conexión a RabbitMQ y la sonda de salud. **Un módulo
 * puede usar `comun/`; `comun/` nunca depende de un módulo** — es la frontera
 * que sustituye al límite de proceso que había entre los microservicios, y la
 * verifica por herramienta la tarjeta 20.
 *
 * Los dominios que sí salieron aparte como servicios replicables —Entradas /
 * Mercado Secundario y Eventos / Emergencias— no están aquí: cumplen un
 * criterio de extracción y siguen siendo despliegues independientes.
 */
@Module({
  imports: [ConfigModule, RedisModule, RabbitMqModule, AdministracionModule, PedidosModule],
  controllers: [SaludController],
})
export class AppModule {}
