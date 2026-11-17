import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { CONFIGURACION_CONCILIACION, ConfiguracionConciliacion } from './comun/config/configuracion';
import { ConciliacionService } from './conciliacion.service';

/** Usuario técnico que queda en la bitácora cuando conciliar lo dispara el job, no una persona. */
export const USUARIO_JOB_CONCILIACION = '00000000-0000-4000-8000-000000000000';

/**
 * CU-031, infraestructura no trivial: "job programado (batch) de
 * conciliación periódica". Cada `intervaloBatchMs` (24 h por defecto) pide
 * sola una conciliación del período recién cerrado, sin esperar a que el
 * administrador financiero la pida a mano. Es el mismo `solicitar` del
 * controlador: termina en la misma cola y el mismo `procesar`.
 */
@Injectable()
export class JobPeriodicoConciliacion implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(JobPeriodicoConciliacion.name);
  private temporizador: NodeJS.Timeout | null = null;

  constructor(
    @Inject(CONFIGURACION_CONCILIACION) private readonly config: ConfiguracionConciliacion,
    private readonly conciliacion: ConciliacionService,
  ) {}

  onModuleInit(): void {
    this.temporizador = setInterval(() => void this.correr(), this.config.intervaloBatchMs);
    this.temporizador.unref();
  }

  onModuleDestroy(): void {
    if (this.temporizador) clearInterval(this.temporizador);
  }

  async correr(): Promise<void> {
    const hasta = new Date();
    const desde = new Date(hasta.getTime() - this.config.intervaloBatchMs);
    try {
      const conciliacion = await this.conciliacion.solicitar({ desde: desde.toISOString(), hasta: hasta.toISOString() }, USUARIO_JOB_CONCILIACION);
      this.log.log(`Conciliación periódica solicitada: ${conciliacion.id} (${desde.toISOString()} – ${hasta.toISOString()})`);
    } catch (error) {
      this.log.error(`Fallo al solicitar la conciliación periódica: ${(error as Error).message}`);
    }
  }
}
