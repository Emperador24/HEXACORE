import { Controller, Get, HttpStatus, Inject, Res } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { DataSource } from 'typeorm';
import { CONFIGURACION, ConfiguracionServicio } from '../config/configuracion';

/** Límite propio de la sonda, siguiendo el servicio de Administración. */
const ESPERA_SONDA_MS = 1000;

@ApiTags('salud')
@Controller('salud')
export class SaludController {
  private readonly arranque = Date.now();

  constructor(
    @Inject(CONFIGURACION) private readonly config: ConfiguracionServicio,
    @InjectDataSource() private readonly fuenteDatos: DataSource,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Estado de esta instancia y de PostgreSQL' })
  @ApiResponse({ status: 200, description: 'PostgreSQL disponible' })
  @ApiResponse({ status: 503, description: 'PostgreSQL no disponible' })
  async estado(@Res({ passthrough: true }) respuesta: Response) {
    const postgres = await this.postgresResponde();
    respuesta.status(postgres ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE);
    return {
      servicio: 'pedidos',
      estado: postgres ? 'arriba' : 'degradado',
      entorno: this.config.entorno,
      dependencias: { postgres: postgres ? 'arriba' : 'caido' },
      tiempoActivoSegundos: Math.floor((Date.now() - this.arranque) / 1000),
      marcaDeTiempo: new Date().toISOString(),
    };
  }

  private async postgresResponde(): Promise<boolean> {
    let temporizador: NodeJS.Timeout | undefined;
    const limite = new Promise<boolean>((resolver) => {
      temporizador = setTimeout(() => resolver(false), ESPERA_SONDA_MS);
    });
    try {
      return await Promise.race([
        this.fuenteDatos.query('SELECT 1').then(() => true, () => false),
        limite,
      ]);
    } catch {
      return false;
    } finally {
      clearTimeout(temporizador);
    }
  }
}
