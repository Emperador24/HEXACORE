import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, LessThanOrEqual } from 'typeorm';
import { EstadoPublicacion, PublicacionReventa } from '../persistencia/entidades/publicacion-reventa.entity';
import { ClienteVentas } from './cliente-ventas.service';
import { GestorConcurrencia } from './concurrencia/gestor-concurrencia.service';

/** Nombre del bloqueo con el que las réplicas se reparten este trabajo. */
const TAREA = 'expirar-publicaciones';

/**
 * Cuánto se retiene el bloqueo del trabajo.
 *
 * Holgado a propósito: si el proceso muere a mitad del barrido, el TTL lo
 * libera solo y la ejecución siguiente lo retoma. Un valor corto podría dejar
 * que una segunda réplica entrara mientras la primera sigue trabajando.
 */
const TTL_TAREA_MS = 60_000;

/** Cuántas publicaciones se procesan por ejecución. */
const LOTE = 200;

/**
 * Cada cuánto se barre.
 *
 * Diez minutos por defecto: la expiración no tiene urgencia, porque una
 * publicación caducada ya es invisible en el mercado desde el instante en que
 * vence —el listado filtra por fecha—. Este barrido solo pone al día el estado
 * guardado, y hacerlo cada minuto sería consultar la base sesenta veces por
 * hora para no encontrar nada casi siempre.
 *
 * Se puede acortar con `EXPIRACION_CRON` para poder verlo funcionar sin esperar
 * diez minutos.
 */
const CRON = process.env.EXPIRACION_CRON ?? CronExpression.EVERY_10_MINUTES;

export interface ResultadoExpiracion {
  revisadas: number;
  expiradas: number;
  /** Publicaciones que se dejaron para la próxima vez porque alguien las está comprando. */
  omitidasPorCheckout: number;
}

/**
 * Flujo alterno **CU-006D**: *"La publicación expira sin haberse vendido"*.
 *
 * ## Por qué hace falta un trabajo si el listado ya filtra por fecha
 *
 * La consulta del mercado (paso 5) ya excluye las publicaciones fuera de su
 * ventana, así que nadie puede comprar una caducada aunque siga marcada
 * `ACTIVA`. Pero eso solo arregla lo que se ve desde fuera; en la base quedaría
 * una publicación `ACTIVA` que no lo está y una entrada `EN_REVENTA` que no se
 * está revendiendo.
 *
 * Eso tiene consecuencias reales: el vendedor vería su entrada como "en venta"
 * para siempre, y el índice único parcial —que impide dos publicaciones activas
 * de la misma entrada— le impediría volver a publicarla. Cerrar la publicación
 * es lo que devuelve la entrada a su dueño.
 *
 * ## Lo que este trabajo NO hace
 *
 * No toca una publicación que tenga un checkout vivo. Si alguien empezó a pagar
 * justo antes de que se cerrara la ventana, su bloqueo en Redis sigue en pie y
 * merece terminar: expirarla en ese momento rompería una compra a medio cobrar.
 * Se deja para la ejecución siguiente, cuando el bloqueo ya no exista.
 */
@Injectable()
export class ExpiracionService {
  private readonly log = new Logger(ExpiracionService.name);

  constructor(
    @InjectDataSource() private readonly fuenteDatos: DataSource,
    private readonly ventas: ClienteVentas,
    private readonly concurrencia: GestorConcurrencia,
  ) {}

  /** Barrido periódico. Ver `CRON`. */
  @Cron(CRON, { name: TAREA })
  async barrer(): Promise<void> {
    const testigo = await this.concurrencia.bloquearTarea(TAREA, TTL_TAREA_MS);
    if (!testigo) {
      // Otra réplica lo está haciendo. No es un error: es exactamente para lo
      // que está el bloqueo.
      this.log.debug('Otra instancia está expirando publicaciones; se omite');
      return;
    }

    try {
      const resultado = await this.expirarVencidas();
      if (resultado.expiradas > 0 || resultado.omitidasPorCheckout > 0) {
        this.log.log(
          `Expiradas ${resultado.expiradas} de ${resultado.revisadas} publicaciones vencidas` +
            (resultado.omitidasPorCheckout > 0
              ? `; ${resultado.omitidasPorCheckout} omitidas por tener una compra en curso`
              : ''),
        );
      }
    } catch (error) {
      // Un fallo aquí no debe tumbar el temporizador: se registra y se
      // reintenta en la ejecución siguiente.
      this.log.error(`Fallo al expirar publicaciones: ${error instanceof Error ? error.message : error}`);
    } finally {
      await this.concurrencia.liberarTarea(TAREA, testigo);
    }
  }

  /**
   * Cierra las publicaciones vencidas y devuelve sus entradas al vendedor.
   *
   * Público además de programado para poder invocarlo desde una prueba sin
   * esperar diez minutos, y para poder forzarlo manualmente si hiciera falta.
   */
  async expirarVencidas(ahora: Date = new Date()): Promise<ResultadoExpiracion> {
    const vencidas = await this.fuenteDatos.manager.find(PublicacionReventa, {
      where: {
        estado: EstadoPublicacion.ACTIVA,
        fechaExpiracion: LessThanOrEqual(ahora),
      },
      // Por lotes: si un evento masivo deja miles de publicaciones sin vender,
      // cargarlas todas de golpe sería una consulta enorme y una transacción
      // larguísima. Lo que quede se recoge en la ejecución siguiente.
      take: LOTE,
      order: { fechaExpiracion: 'ASC' },
    });

    let expiradas = 0;
    let omitidasPorCheckout = 0;

    for (const publicacion of vencidas) {
      const enCheckout = await this.concurrencia.tiempoRestanteMs(publicacion.id);
      if (enCheckout !== null) {
        omitidasPorCheckout += 1;
        continue;
      }

      if (await this.expirarUna(publicacion, ahora)) expiradas += 1;
    }

    return { revisadas: vencidas.length, expiradas, omitidasPorCheckout };
  }

  /**
   * Cierra una publicación y pide que liberen su entrada.
   *
   * Mismo orden que al retirar (CU-006B) y por la misma razón: primero el
   * cierre local, después la liberación remota. Si fuera al revés, quedaría un
   * anuncio activo sobre una entrada ya usable.
   *
   * Aquí ese orden sale además gratis: como no hay nadie esperando, si la
   * liberación falla el reloj volverá a pasar. Lo que no puede quedar es la
   * publicación abierta.
   */
  private async expirarUna(publicacion: PublicacionReventa, ahora: Date): Promise<boolean> {
    // El `estado: ACTIVA` en el WHERE no es redundante con la consulta de
    // arriba: entre que se leyó la lista y llega este UPDATE, alguien pudo
    // comprar o retirar la publicación. Si eso pasó, el UPDATE no afecta a
    // ninguna fila y no se pisa la venta.
    const actualizadas = await this.fuenteDatos.manager.update(
      PublicacionReventa,
      { id: publicacion.id, estado: EstadoPublicacion.ACTIVA },
      { estado: EstadoPublicacion.EXPIRADA, fechaCierre: ahora },
    );

    if (!actualizadas.affected) return false;

    // La entrada vuelve a su dueño. Igual que al retirar, esto no es un cambio
    // de propietario: Ventas no genera QR nuevo ni fila de historial, porque
    // nadie ha dejado de ser dueño de nada.
    //
    // Ventas condiciona su UPDATE a `EN_REVENTA`, que es la misma protección
    // que tenía este código cuando la tabla estaba aquí: si la entrada se
    // hubiera marcado USADA o ANULADA mientras tanto, devolverla a VALIDA
    // la resucitaría.
    //
    // Va con el credencial de servicio y no con un token de usuario: este
    // trabajo corre por reloj y no hay usuario ninguno.
    await this.ventas.devolverDeReventa(publicacion.entradaId, this.ventas.comoServicio());

    return true;
  }
}
