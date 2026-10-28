import { Inject, Module, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import { ConfigModule } from '../../../comun/config/config.module';
import { PersistenciaModule } from '../persistencia/persistencia.module';
import { PreparacionInventarioService } from './preparacion-inventario.service';
import { proveedorRedisInventario, REDIS_INVENTARIO } from './redis-inventario.provider';
import { ReservasService } from './reservas.service';

/**
 * Infraestructura exportada; todavía no se importa desde checkout ni pagos.
 *
 * Importa `ConfigModule` explícitamente aunque sea `@Global`: el preparador de
 * inventario arranca **este módulo suelto** con
 * `NestFactory.createApplicationContext(InventarioModule)`, y en ese contexto
 * no hay app que haya cargado antes el módulo global. Sin esto, el comando de
 * mantenimiento falla por `CONFIGURACION_SERVICIO` sin resolver — que es justo
 * lo que pasaba desde la fusión de ADR-12, oculto porque las suites de CU-011
 * no estaban enganchadas al runner.
 */
@Module({
  imports: [ConfigModule, PersistenciaModule],
  providers: [proveedorRedisInventario, ReservasService, PreparacionInventarioService],
  exports: [ReservasService, PreparacionInventarioService],
})
export class InventarioModule implements OnModuleDestroy {
  constructor(@Inject(REDIS_INVENTARIO) private readonly redis: Redis) {}
  onModuleDestroy(): void { this.redis.disconnect(); }
}
