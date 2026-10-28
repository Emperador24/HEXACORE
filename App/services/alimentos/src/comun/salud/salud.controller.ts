import { Controller, Get, HttpStatus, Inject, Res } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { Response } from 'express';
import { DataSource } from 'typeorm';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CONFIGURACION, ConfiguracionServicio } from '../config/configuracion';
import { REDIS } from '../redis/redis.module';
import type Redis from 'ioredis';

/**
 * Sonda de vida de Alimentos.
 *
 * Comprueba sus dependencias, no solo que el proceso respire: una instancia
 * sin Redis no puede reservar inventario y aceptar pedidos en ese estado sería
 * abrir la ventana de sobreventa que el CU-011 prohíbe. Más vale que el
 * balanceador la saque de rotación.
 *
 * El broker **no** entra en el veredicto, y es deliberado: publicar el evento
 * de pedido ocurre después de cerrarlo y fuera del camino de respuesta. Sacar
 * la instancia por eso pararía las ventas por un fallo en algo que solo avisa.
 *
 * Una sola base, no dos: al salir del Núcleo este servicio dejó de compartir
 * proceso con Administración.
 */
@ApiTags('salud')
@Controller('salud')
export class SaludController {
  private readonly arranque = Date.now();

  constructor(
    @Inject(CONFIGURACION) private readonly config: ConfiguracionServicio,
    @InjectDataSource() private readonly pedidos: DataSource,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Estado de esta instancia y de sus dependencias' })
  @ApiResponse({ status: 200, description: 'La instancia puede atender tráfico' })
  @ApiResponse({ status: 503, description: 'Le falta alguna dependencia; no debería recibir tráfico' })
  async estado(@Res({ passthrough: true }) respuesta: Response) {
    const [postgres, redis] = await Promise.all([this.postgresResponde(), this.redisResponde()]);
    const listo = postgres && redis;

    // 503 y no 200-con-un-campo-"degradado": los balanceadores y Kubernetes
    // deciden por el código HTTP, no por el cuerpo.
    respuesta.status(listo ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE);

    return {
      servicio: 'alimentos',
      estado: listo ? 'arriba' : 'degradado',
      entorno: this.config.entorno,
      dependencias: {
        postgres: postgres ? 'arriba' : 'caido',
        redis: redis ? 'arriba' : 'caido',
      },
      tiempoActivoSegundos: Math.floor((Date.now() - this.arranque) / 1000),
      marcaDeTiempo: new Date().toISOString(),
    };
  }

  private async postgresResponde(): Promise<boolean> {
    try {
      await this.pedidos.query('SELECT 1');
      return true;
    } catch {
      return false;
    }
  }

  private async redisResponde(): Promise<boolean> {
    try {
      return (await this.redis.ping()) === 'PONG';
    } catch {
      return false;
    }
  }
}
