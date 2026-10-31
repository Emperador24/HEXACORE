import { Controller, Get, HttpStatus, Inject, Res } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { Response } from 'express';
import { DataSource } from 'typeorm';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CONFIGURACION, ConfiguracionServicio } from '../comun/config/configuracion';

/**
 * Sonda de vida de Pagos.
 *
 * Solo PostgreSQL decide: sin el libro de idempotencia no se puede cobrar sin
 * arriesgarse a cobrar dos veces, así que una instancia sin base debe salir de
 * rotación.
 *
 * La **pasarela no entra en el veredicto**, y es deliberado: que el proveedor
 * esté caído no es un fallo de esta instancia. El adaptador ya traduce eso a
 * INDETERMINADO y el llamante decide; sacar la instancia de rotación además
 * solo convertiría un problema del proveedor en uno nuestro.
 */
@ApiTags('salud')
@Controller('salud')
export class SaludController {
  private readonly arranque = Date.now();

  constructor(
    @Inject(CONFIGURACION) private readonly config: ConfiguracionServicio,
    @InjectDataSource() private readonly datos: DataSource,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Estado de esta instancia y de sus dependencias' })
  @ApiResponse({ status: 200, description: 'La instancia puede atender tráfico' })
  @ApiResponse({ status: 503, description: 'Sin base; no debería recibir tráfico' })
  async estado(@Res({ passthrough: true }) respuesta: Response) {
    const postgres = await this.postgresResponde();
    respuesta.status(postgres ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE);

    return {
      servicio: 'pagos',
      estado: postgres ? 'arriba' : 'degradado',
      entorno: this.config.entorno,
      dependencias: { postgres: postgres ? 'arriba' : 'caido' },
      tiempoActivoSegundos: Math.floor((Date.now() - this.arranque) / 1000),
      marcaDeTiempo: new Date().toISOString(),
    };
  }

  private async postgresResponde(): Promise<boolean> {
    try {
      await this.datos.query('SELECT 1');
      return true;
    } catch {
      return false;
    }
  }
}
