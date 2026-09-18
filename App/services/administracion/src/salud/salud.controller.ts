import { Controller, Get, HttpStatus, Inject, Res } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import Redis from 'ioredis';
import { DataSource } from 'typeorm';
import { CONFIGURACION, ConfiguracionServicio } from '../config/configuracion';
import { ConexionRabbitMq } from '../notificaciones/conexion-rabbitmq.service';
import { REDIS } from '../sesiones/revocaciones-compartidas.service';

/** Cuánto se espera a cada dependencia. La sonda tiene que contestar rápido siempre. */
const ESPERA_SONDA_MS = 1000;

/**
 * Sonda de salud (RNF-03, RNF-04).
 *
 * El CU-027 marca la Disponibilidad como atributo de calidad: *"el login es
 * crítico y debe responder incluso en horas pico"*. Si este servicio cae,
 * **nadie puede entrar a ninguna parte del sistema**. Que el balanceador
 * (ADR-02) sepa cuándo una instancia puede atender importa aquí más que en
 * ningún otro sitio.
 *
 * ## Solo PostgreSQL decide
 *
 * La primera versión respondía 200 siempre, aunque la base estuviera colgada:
 * un balanceador habría seguido mandando logins a una instancia que no podía
 * atender ninguno. Ahora, sin PostgreSQL, **503**.
 *
 * Redis y RabbitMQ se informan pero **no** sacan la instancia de rotación, y
 * es medido, no supuesto: con cualquiera de los dos caídos, el login y el
 * registro siguen funcionando. Sin Redis falla cerrar sesión; sin RabbitMQ se
 * retrasan los correos. Retirar la instancia por eso dejaría a todo el mundo
 * sin poder entrar por un fallo que no impide entrar.
 */
@ApiTags('salud')
@Controller('salud')
export class SaludController {
  private readonly arranque = Date.now();

  constructor(
    @Inject(CONFIGURACION) private readonly config: ConfiguracionServicio,
    @InjectDataSource() private readonly fuenteDatos: DataSource,
    @Inject(REDIS) private readonly redis: Redis,
    private readonly rabbitmq: ConexionRabbitMq,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Estado de esta instancia y de sus dependencias' })
  @ApiResponse({ status: 200, description: 'La instancia puede atender logins' })
  @ApiResponse({ status: 503, description: 'Sin PostgreSQL: no debería recibir tráfico' })
  async estado(@Res({ passthrough: true }) respuesta: Response) {
    const [postgres, redis] = await Promise.all([
      this.responde(() => this.fuenteDatos.query('SELECT 1')),
      this.responde(() => this.redis.ping()),
    ]);
    const rabbitmq = this.rabbitmq.conectado;

    // Por el código HTTP, no por el cuerpo: es lo que miran los balanceadores.
    respuesta.status(postgres ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE);

    return {
      servicio: 'administracion',
      estado: !postgres ? 'caido' : redis && rabbitmq ? 'arriba' : 'degradado',
      entorno: this.config.entorno,
      dependencias: {
        postgres: postgres ? 'arriba' : 'caido',
        // Informativos: ver arriba.
        redis: redis ? 'arriba' : 'caido',
        rabbitmq: rabbitmq ? 'arriba' : 'caido',
      },
      tiempoActivoSegundos: Math.floor((Date.now() - this.arranque) / 1000),
      marcaDeTiempo: new Date().toISOString(),
    };
  }

  /**
   * Si la dependencia contesta a tiempo.
   *
   * Con límite propio, sin fiarse de los del cliente: una sonda que se cuelga
   * con su dependencia es tan inútil como una que no la mira.
   */
  private async responde(consulta: () => Promise<unknown>): Promise<boolean> {
    let temporizador: NodeJS.Timeout | undefined;
    const limite = new Promise<boolean>((resolver) => {
      temporizador = setTimeout(() => resolver(false), ESPERA_SONDA_MS);
    });
    try {
      return await Promise.race([
        consulta().then(
          () => true,
          () => false,
        ),
        limite,
      ]);
    } finally {
      clearTimeout(temporizador);
    }
  }
}
