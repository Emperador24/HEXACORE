import { Controller, Get, HttpStatus, Inject, Res } from '@nestjs/common';
import { Response } from 'express';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CONFIGURACION, ConfiguracionServicio } from '../config/configuracion';
import { ConexionRabbitMq } from '../comun/rabbitmq/conexion-rabbitmq.service';

/**
 * Sonda de vida de Notificaciones.
 *
 * Aquí el broker **sí** decide el veredicto, al revés que en los servicios que
 * venden. Para ellos publicar un evento ocurre fuera del camino de respuesta y
 * perder el broker no impide cobrar; para este servicio la cola **es** su
 * entrada de trabajo: sin ella no hay nada que hacer y la instancia no debería
 * contar como lista.
 *
 * No mira PostgreSQL porque no tiene: su estado vive en la cola.
 */
@ApiTags('salud')
@Controller('salud')
export class SaludController {
  private readonly arranque = Date.now();

  constructor(
    @Inject(CONFIGURACION) private readonly config: ConfiguracionServicio,
    private readonly rabbitmq: ConexionRabbitMq,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Estado de esta instancia y de sus dependencias' })
  @ApiResponse({ status: 200, description: 'La instancia puede consumir la cola' })
  @ApiResponse({ status: 503, description: 'Sin broker; no hay trabajo que pueda tomar' })
  estado(@Res({ passthrough: true }) respuesta: Response) {
    const listo = this.rabbitmq.conectado;
    respuesta.status(listo ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE);

    return {
      servicio: 'notificaciones',
      estado: listo ? 'arriba' : 'degradado',
      entorno: this.config.entorno,
      dependencias: { rabbitmq: listo ? 'arriba' : 'caido' },
      tiempoActivoSegundos: Math.floor((Date.now() - this.arranque) / 1000),
      marcaDeTiempo: new Date().toISOString(),
    };
  }
}
