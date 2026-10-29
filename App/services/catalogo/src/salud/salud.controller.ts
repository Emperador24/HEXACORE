import { Controller, Get, HttpStatus, Inject, Res } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { Response } from 'express';
import { DataSource } from 'typeorm';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CONFIGURACION, ConfiguracionServicio } from '../config/configuracion';

/**
 * Sonda de vida del Catálogo.
 *
 * Comprueba su única dependencia, PostgreSQL. Una instancia sin base no puede
 * responder la cartelera, así que debe salir de rotación en vez de devolver
 * errores: es lo que RNF-15 (desplegar con 0 solicitudes fallidas) necesita
 * del balanceador.
 *
 * La lista es corta a propósito. Dentro de `ventas` esta
 * misma sonda miraba además Redis y RabbitMQ, y una caída de Redis sacaba de
 * rotación a la cartelera aunque la cartelera no use Redis. Separar el
 * servicio arregló eso solo.
 */
@ApiTags('salud')
@Controller('salud')
export class SaludController {
  private readonly arranque = Date.now();

  constructor(
    @Inject(CONFIGURACION) private readonly config: ConfiguracionServicio,
    @InjectDataSource() private readonly fuenteDatos: DataSource,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Estado de esta instancia y de sus dependencias' })
  @ApiResponse({ status: 200, description: 'La instancia puede atender tráfico' })
  @ApiResponse({ status: 503, description: 'Le falta la base; no debería recibir tráfico' })
  async estado(@Res({ passthrough: true }) respuesta: Response) {
    const postgres = await this.postgresResponde();

    // 503 y no 200-con-un-campo-"degradado": los balanceadores y Kubernetes
    // deciden por el código HTTP, no por el cuerpo.
    respuesta.status(postgres ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE);

    return {
      servicio: 'catalogo',
      estado: postgres ? 'arriba' : 'degradado',
      entorno: this.config.entorno,
      dependencias: { postgres: postgres ? 'arriba' : 'caido' },
      tiempoActivoSegundos: Math.floor((Date.now() - this.arranque) / 1000),
      marcaDeTiempo: new Date().toISOString(),
    };
  }

  private async postgresResponde(): Promise<boolean> {
    try {
      await this.fuenteDatos.query('SELECT 1');
      return true;
    } catch {
      return false;
    }
  }
}
