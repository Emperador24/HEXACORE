import { Inject, Module, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import { ConfigModule } from '../config/config.module';
import { proveedorRedisInventario, REDIS_INVENTARIO } from './redis-inventario.provider';
import { ReservasService } from './reservas.service';

/** Infraestructura exportada; todavía no se importa desde checkout ni pagos. */
@Module({
  imports: [ConfigModule],
  providers: [proveedorRedisInventario, ReservasService],
  exports: [ReservasService],
})
export class InventarioModule implements OnModuleDestroy {
  constructor(@Inject(REDIS_INVENTARIO) private readonly redis: Redis) {}
  onModuleDestroy(): void { this.redis.disconnect(); }
}
