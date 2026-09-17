import { Controller, Get, HttpStatus, Inject, Res } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { Response } from 'express';
import { DataSource } from 'typeorm';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CONFIGURACION, ConfiguracionServicio } from '../config/configuracion';
import { GestorConcurrencia } from '../reventa/concurrencia/gestor-concurrencia.service';
import { ConexionRabbitMq } from '../reventa/eventos/conexion-rabbitmq.service';

/**
 * Sonda de vida del servicio.
 *
 * RNF-15 exige desplegar una versión nueva con 0 solicitudes fallidas, y
 * RNF-04 recuperarse en ≤ 30 s sin intervención: ambas cosas necesitan que el
 * balanceador (ADR-02) sepa cuándo esta instancia está lista para recibir
 * tráfico.
 *
 * **Comprueba sus dependencias, no solo que el proceso respire.** Una
 * instancia sin Redis no puede bloquear un checkout (ADR-03), así que aceptar
 * compras en ese estado sería justamente abrir la ventana de doble venta que
 * RNF-01 prohíbe: más vale que el balanceador la saque de rotación.
 */
@ApiTags('salud')
@Controller('salud')
export class SaludController {
  private readonly arranque = Date.now();

  constructor(
    @Inject(CONFIGURACION) private readonly config: ConfiguracionServicio,
    @InjectDataSource() private readonly fuenteDatos: DataSource,
    private readonly concurrencia: GestorConcurrencia,
    private readonly rabbitmq: ConexionRabbitMq,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Estado de esta instancia y de sus dependencias' })
  @ApiResponse({ status: 200, description: 'La instancia puede atender tráfico' })
  @ApiResponse({ status: 503, description: 'Le falta alguna dependencia; no debería recibir tráfico' })
  async estado(@Res({ passthrough: true }) respuesta: Response) {
    const [postgres, redis] = await Promise.all([this.postgresResponde(), this.concurrencia.responde()]);
    const rabbitmq = this.rabbitmq.conectado;

    // RabbitMQ NO entra en el veredicto, y es deliberado. Sin él no salen las
    // notificaciones ni las liquidaciones (pasos 12 y 13), pero sí se pueden
    // seguir vendiendo entradas: publicar el evento ocurre después de cerrar
    // la venta y fuera del camino de respuesta. Sacar la instancia de rotación
    // por eso pararía las ventas por un fallo en algo que solo manda correos —
    // justo el acoplamiento que ADR-04 quería evitar.
    const listo = postgres && redis;

    // 503 y no 200-con-un-campo-"degradado": los balanceadores y Kubernetes
    // deciden por el código HTTP, no por el cuerpo. Un 200 con malas noticias
    // dentro mantendría la instancia en rotación.
    respuesta.status(listo ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE);

    return {
      servicio: 'entradas-mercado-secundario',
      estado: listo ? 'arriba' : 'degradado',
      entorno: this.config.entorno,
      dependencias: {
        postgres: postgres ? 'arriba' : 'caido',
        redis: redis ? 'arriba' : 'caido',
        // Informativo: se ve en la sonda pero no tumba la instancia.
        rabbitmq: rabbitmq ? 'arriba' : 'caido',
      },
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
