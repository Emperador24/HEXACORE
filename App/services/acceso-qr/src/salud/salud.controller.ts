import { Controller, Get, HttpStatus, Inject, Res } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { Response } from 'express';
import { DataSource } from 'typeorm';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CONFIGURACION, ConfiguracionServicio } from '../config/configuracion';

/**
 * Sonda de vida de Acceso QR.
 *
 * Solo PostgreSQL decide. **Ventas no entra en el veredicto** aunque haga
 * falta para validar: si Ventas está caído, esta instancia sigue siendo la
 * buena para atender la puerta —y lo que hace entonces es negar el paso con un
 * mensaje claro, que es mejor que no haber nadie escuchando—. Sacarla de
 * rotación por un fallo ajeno solo añadiría un segundo problema.
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
  @ApiResponse({ status: 200, description: 'La instancia puede atender la puerta' })
  @ApiResponse({ status: 503, description: 'Sin base; no debería recibir tráfico' })
  async estado(@Res({ passthrough: true }) respuesta: Response) {
    const postgres = await this.postgresResponde();
    respuesta.status(postgres ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE);

    return {
      servicio: 'acceso-qr',
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
