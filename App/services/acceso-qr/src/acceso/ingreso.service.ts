import { HttpException, Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { createHash } from 'node:crypto';
import { DataSource, EntityManager } from 'typeorm';
import { EstadoEvento, EventoReferencia } from '../persistencia/entidades/evento-referencia.entity';
import { Ingreso, OrigenIngreso } from '../persistencia/entidades/ingreso.entity';
import { EstadoQr, QrEntrada } from '../persistencia/entidades/qr-entrada.entity';
import { BandejaSalida } from '../comun/eventos/bandeja-salida.service';
import { Contadores } from './contadores';
import {
  CacheQrDto,
  IngresoAutorizadoDto,
  ResultadoSincronizacionDto,
  SincronizacionDto,
  SincronizarIngresosDto,
  ValidarQrDto,
} from './dto/ingreso.dto';
import { AforoCompleto, QrInvalido, QrYaUtilizado } from './acceso.errors';

interface Escaneo {
  eventoId: string;
  codigoQr: string;
  puntoAcceso: string | null;
  origen: OrigenIngreso;
  escaneadoEn: Date;
}

/**
 * Validar QR CU-002.
 *
 * Desde ADR-15 se valida **contra la copia local de los QR** (`qr_entradas`),
 * que mantiene `ProyeccionQr` con los eventos de Ventas. Ya no se llama a
 * Ventas en ningún momento: el diagrama de contenedores no tiene esa flecha.
 *
 * Cada ingreso sale como `IngresoRegistrado` por la bandeja de salida, en la
 * misma transacción, para que Ventas marque la entrada como usada.
 *
 * Un mismo QR no puede validar dos ingresos simultáneos. Lo decide el
 * `UPDATE qr_entradas SET estado = 'USADA' WHERE estado = 'VALIDA'`, ahora en la
 * base propia y **en la misma transacción** que el aforo y el registro del
 * ingreso. Antes era una Saga con compensación remota; ahora es atómico.
 *
 * Operar sin conexión CU-002E: el dispositivo descarga los QR válidos del
 * evento como **hashes**, valida contra ellos si pierde la red, y al volver
 * sube lo que escaneó. Se guardan y se mandan hashes, no códigos: ni la base ni
 * el teléfono de la puerta tienen códigos con los que entrar.
 */
/** Exchange de los hechos de la puerta. Lo consume Ventas. */
export const EXCHANGE_ACCESO = 'acceso.eventos';

@Injectable()
export class IngresoService {
  private readonly log = new Logger(IngresoService.name);

  constructor(
    @InjectDataSource() private readonly fuenteDatos: DataSource,
    private readonly contadores: Contadores,
    private readonly bandeja: BandejaSalida,
  ) {}

  async validar(personalId: string, datos: ValidarQrDto): Promise<IngresoAutorizadoDto> {
    return this.registrar(personalId, {
      eventoId: datos.eventoId,
      codigoQr: datos.codigoQr.trim(),
      puntoAcceso: datos.puntoAcceso ?? null,
      origen: OrigenIngreso.EN_LINEA,
      escaneadoEn: new Date(),
    });
  }

  /** CU-002E: los QR que podrían ingresar, para validar sin conexión. Ya vienen hasheados. */
  async cache(eventoId: string): Promise<CacheQrDto> {
    const validos = await this.fuenteDatos.getRepository(QrEntrada).find({
      where: { eventoId, estado: EstadoQr.VALIDA },
      select: { hashQr: true, numeroTicket: true, localidadNombre: true },
      order: { numeroTicket: 'ASC' },
    });
    return {
      eventoId,
      generadaEn: new Date().toISOString(),
      validos: validos.map((q) => ({ hash: q.hashQr, numeroTicket: q.numeroTicket, localidadNombre: q.localidadNombre })),
    };
  }

  /**
   * CU-002E: sube los ingresos hechos sin conexión.
   *
   * Si un mismo QR es escaneado en dos puertas desconectadas
   * vuelve como conflicto para que el personal lo revise
   */
  async sincronizar(personalId: string, datos: SincronizarIngresosDto): Promise<SincronizacionDto> {
    const resultados: ResultadoSincronizacionDto[] = [];
    // Uno a uno y en orden, si el mismo QR aparece dos veces cuenta el primero
    const ordenados = [...datos.ingresos].sort((a, b) => a.escaneadoEn.localeCompare(b.escaneadoEn));
    for (const ingreso of ordenados) {
      try {
        await this.registrar(personalId, {
          eventoId: datos.eventoId,
          codigoQr: ingreso.codigoQr.trim(),
          puntoAcceso: ingreso.puntoAcceso ?? null,
          origen: OrigenIngreso.SINCRONIZADO,
          escaneadoEn: new Date(ingreso.escaneadoEn),
        });
        resultados.push({ codigoQr: ingreso.codigoQr, resultado: 'REGISTRADO', mensaje: 'Ingreso registrado' });
      } catch (error) {
        if (!(error instanceof HttpException)) throw error;
        const cuerpo = error.getResponse() as { codigo?: string; mensaje?: string };
        resultados.push({
          codigoQr: ingreso.codigoQr,
          resultado: cuerpo.codigo ?? 'ERROR',
          mensaje: cuerpo.mensaje ?? error.message,
        });
      }
    }
    const registrados = resultados.filter((r) => r.resultado === 'REGISTRADO').length;
    this.log.log(`Sincronización de ${datos.eventoId}: ${registrados} registrados, ${resultados.length - registrados} conflictos`);
    return { registrados, conflictos: resultados.length - registrados, resultados };
  }

  /**
   * Registra un ingreso: QR, aforo y registro **en una sola transacción local**.
   *
   * 1. Se bloquea la fila del QR (`FOR UPDATE`). Dos puertas escaneando el
   *    mismo código a la vez: la segunda espera, y al seguir ya lo ve `USADA`.
   * 2. Se suma al aforo con la condición `asistentes < aforo_maximo`.
   * 3. Se marca el QR `USADA` y se deja la fila de ingreso.
   *
   * Si algo falla —el aforo está lleno, por ejemplo—, se deshace todo junto: un
   * aforo lleno no puede dejar la entrada quemada. No hay compensación que
   * pueda fallar, porque no hay nada fuera de esta base.
   */
  private async registrar(personalId: string, escaneo: Escaneo): Promise<IngresoAutorizadoDto> {
    const evento = await this.fuenteDatos
      .getRepository(EventoReferencia)
      .findOne({ where: { eventoId: escaneo.eventoId } });
    if (!evento) throw new QrInvalido('el evento no existe');
    if (evento.estado === EstadoEvento.CANCELADO) throw new QrInvalido('el evento fue cancelado');

    return this.fuenteDatos.transaction(async (tx) => {
      const qr = await tx.findOne(QrEntrada, {
        where: { hashQr: hashQr(escaneo.codigoQr) },
        lock: { mode: 'pessimistic_write' },
      });
      if (!qr || qr.eventoId !== escaneo.eventoId) {
        throw new QrInvalido('el código no corresponde a una entrada de este evento');
      }
      if (qr.estado === EstadoQr.USADA) throw await this.yaUtilizado(tx, qr.entradaId);
      if (qr.estado === EstadoQr.ANULADA) throw new QrInvalido('la entrada fue anulada');
      if (qr.estado === EstadoQr.EN_REVENTA) {
        throw new QrInvalido('la entrada está publicada en reventa; su dueño debe retirarla primero');
      }

      if (!(await this.contadores.sumarAsistente(tx, escaneo.eventoId))) {
        this.log.error(
          `ALERTA CU-002B: ${evento.nombre} llego a su aforo (${evento.aforoMaximo}) ` +
            `y la entrada ${qr.numeroTicket} se quedo fuera`,
        );
        throw new AforoCompleto(evento.aforoMaximo ?? 0);
      }

      // La condición `estado = VALIDA` sigue en el UPDATE aunque la fila esté
      // bloqueada: es la regla escrita donde se aplica, no una suposición.
      const marcada = await tx.update(
        QrEntrada,
        { entradaId: qr.entradaId, estado: EstadoQr.VALIDA },
        { estado: EstadoQr.USADA },
      );
      if (!marcada.affected) throw await this.yaUtilizado(tx, qr.entradaId);

      // El UNIQUE(entrada_id) de `ingresos` sigue siendo la segunda defensa.
      const ingreso = await tx.save(
        tx.create(Ingreso, {
          entradaId: qr.entradaId,
          eventoId: escaneo.eventoId,
          validadoPor: personalId,
          puntoAcceso: escaneo.puntoAcceso,
          origen: escaneo.origen,
          escaneadoEn: escaneo.escaneadoEn,
        }),
      );

      // Ventas no se entera de quién entró si no se le dice: sin esto dejaría
      // cancelar con reembolso (CU-003D) o revender una entrada ya usada.
      await this.bandeja.encolar(tx, EXCHANGE_ACCESO, 'ingreso.registrado', {
        id: ingreso.id,
        tipo: 'INGRESO_REGISTRADO',
        version: 1,
        ocurridoEn: ingreso.registradoEn.toISOString(),
        entradaId: qr.entradaId,
        eventoId: escaneo.eventoId,
        puntoAcceso: escaneo.puntoAcceso,
        escaneadoEn: escaneo.escaneadoEn.toISOString(),
      });

      return {
        autorizado: true,
        mensaje: 'Ingreso autorizado',
        numeroTicket: qr.numeroTicket,
        localidadNombre: qr.localidadNombre,
        eventoNombre: evento.nombre,
        registradoEn: ingreso.registradoEn.toISOString(),
        asistentes: evento.asistentes + 1,
        aforoMaximo: evento.aforoMaximo,
      };
    });
  }

  // CU-002D  cuándo y por donde se entro
  private async yaUtilizado(tx: EntityManager, entradaId: string): Promise<QrYaUtilizado> {
    const previo = await tx.getRepository(Ingreso).findOne({ where: { entradaId } });
    this.log.warn(`CU-002D: intento de reutilizar la entrada ${entradaId}`);
    return new QrYaUtilizado(previo?.escaneadoEn ?? null, previo?.puntoAcceso ?? null);
  }
}

// hash de comparacion sin conocer el codigo
export function hashQr(codigo: string): string {
  return createHash('sha256').update(codigo).digest('hex');
}
