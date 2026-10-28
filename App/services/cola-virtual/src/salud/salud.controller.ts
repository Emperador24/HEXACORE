import { Controller, Get, HttpStatus, Inject, Res } from '@nestjs/common';
import { Response } from 'express';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type Redis from 'ioredis';
import { CONFIGURACION, ConfiguracionServicio } from '../comun/config/configuracion';
import { REDIS } from '../comun/redis/redis.module';

/**
 * Sonda de vida de la Cola virtual.
 *
 * Redis decide, y aquí no hay matiz posible: **la fila es Redis**. Una
 * instancia sin él no puede repartir turnos, y dejar pasar a todos mientras
 * tanto quitaría justo la protección que este servicio es. Se sale de rotación.
 */
@ApiTags('salud')
@Controller('salud')
export class SaludController {
  private readonly arranque = Date.now();

  constructor(
    @Inject(CONFIGURACION) private readonly config: ConfiguracionServicio,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Estado de esta instancia y de su fila' })
  @ApiResponse({ status: 200, description: 'La instancia puede repartir turnos' })
  @ApiResponse({ status: 503, description: 'Sin Redis no hay fila' })
  async estado(@Res({ passthrough: true }) respuesta: Response) {
    const redis = await this.redisResponde();
    respuesta.status(redis ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE);

    return {
      servicio: 'cola-virtual',
      estado: redis ? 'arriba' : 'degradado',
      entorno: this.config.entorno,
      dependencias: { redis: redis ? 'arriba' : 'caido' },
      aforoConcurrente: this.config.cola.aforoConcurrente,
      tiempoActivoSegundos: Math.floor((Date.now() - this.arranque) / 1000),
      marcaDeTiempo: new Date().toISOString(),
    };
  }

  private async redisResponde(): Promise<boolean> {
    try {
      return (await this.redis.ping()) === 'PONG';
    } catch {
      return false;
    }
  }
}
