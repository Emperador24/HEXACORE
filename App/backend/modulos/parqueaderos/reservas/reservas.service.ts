import {
  BadRequestException, ConflictException, HttpException, Inject, Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import type { Redis } from 'ioredis';
import { randomBytes } from 'node:crypto';
import { DataSource, EntityManager, QueryFailedError } from 'typeorm';
import { REDIS } from '../../../compartido/redis/redis.module';
import { EventosService } from '../../eventos-recintos/eventos/eventos.service';
import { CobrarDto, PagosService, ResultadoCobro, validarSolicitudPagos } from '../../finanzas/pagos';
import { AsignacionService } from '../asignacion/asignacion.service';
import { CobroService, horasEntre } from '../cobro/cobro.service';
import { TIPOS_VEHICULO, TipoVehiculo, nombreTipo, normalizarPlaca } from '../comun/vehiculos';
import { ReservarDto } from '../dto/parqueaderos.dto';
import { CONEXION_PARQUEADEROS } from '../persistencia/conexion';
import { NotificadorReservas } from './notificador-reservas.service';

/** CU-021, paso 4: cuánto se retiene el espacio mientras se paga (CU-021C al vencer). */
export const MINUTOS_PARA_PAGAR = 10;
/** Cada cuánto se liberan las reservas vencidas sin pagar. */
const BARRIDO_MS = 15_000;
/** Una llegada prevista más atrás que esto ya no tiene sentido reservarla. */
const TOLERANCIA_LLEGADA_MIN = 15;
const ALFABETO_QR = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const llaveBloqueo = (espacioId: string) => `parqueaderos:bloqueo:${espacioId}`;

const COLUMNAS_RESERVA = `r.id, r.evento_id AS "eventoId", r.zona_id AS "zonaId", z.nombre AS zona, r.espacio_id AS "espacioId", s.codigo AS espacio,
  r.cliente_id AS "clienteId", r.placa, r.tipo_vehiculo AS "tipoVehiculo", r.llegada_estimada AS "llegadaEstimada", r.estado,
  r.valor_hora::float AS "valorHora", r.horas, r.monto::float AS monto, r.expira_en AS "expiraEn", r.intentos_rechazados AS "intentosRechazados",
  r.motivo, r.referencia_pago AS "referenciaPago", r.codigo_qr AS "codigoQr", r.creada_en AS "creadaEn", r.confirmada_en AS "confirmadaEn",
  r.usada_en AS "usadaEn"`;
const DESDE_RESERVA = `FROM reservas r JOIN zonas_parqueadero z ON z.id = r.zona_id JOIN espacios s ON s.id = r.espacio_id`;

interface Reserva {
  id: string; eventoId: string; zonaId: string; zona: string; espacioId: string; espacio: string; clienteId: string; placa: string;
  tipoVehiculo: TipoVehiculo; llegadaEstimada: Date; estado: string; valorHora: number; horas: number; monto: number; expiraEn: Date;
  intentosRechazados: number; motivo: string | null; referenciaPago: string | null; codigoQr: string | null;
  creadaEn: Date; confirmadaEn: Date | null; usadaEn: Date | null;
}

/**
 * CU-021: Reservar parqueadero.
 *
 * Reservar retiene un espacio concreto (asignado por CU-023) mientras el
 * cliente paga. La retención vive en dos sitios con papeles distintos:
 *
 * - **Redis** (infraestructura no trivial de la ficha) lleva el bloqueo
 *   temporal con su vencimiento (`SET … PX`), barato de consultar.
 * - **PostgreSQL** es la garantía: la reserva se escribe con la zona
 *   bloqueada y dos índices únicos parciales impiden reservar dos veces el
 *   mismo espacio o la misma placa. Si Redis no responde, la reserva sigue
 *   funcionando solo con la base.
 *
 * El pago reutiliza Finanzas/Pagos como la compra de entradas: la clave de
 * idempotencia cambia solo tras un rechazo (CU-021B), así reintentar tras una
 * respuesta incierta nunca cobra dos veces. Pagada la reserva se genera el QR
 * (paso 7), se suelta el bloqueo temporal (paso 8) y la confirmación sale por
 * la bandeja de avisos (paso 9).
 */
@Injectable()
export class ReservasService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(ReservasService.name);
  private temporizador: NodeJS.Timeout | null = null;
  private barriendo: Promise<number> | null = null;

  constructor(
    @InjectDataSource(CONEXION_PARQUEADEROS) private readonly datos: DataSource,
    @Inject(REDIS) private readonly redis: Redis,
    private readonly eventos: EventosService,
    private readonly asignacion: AsignacionService,
    private readonly cobro: CobroService,
    private readonly pagos: PagosService,
    private readonly notificador: NotificadorReservas,
  ) {}

  onModuleInit(): void {
    this.temporizador = setInterval(() => void this.expirarVencidas(), BARRIDO_MS);
    this.temporizador.unref();
  }

  async onModuleDestroy(): Promise<void> {
    if (this.temporizador) clearInterval(this.temporizador);
    await this.barriendo?.catch(() => undefined);
  }

  // --- Pasos 1-2: disponibilidad ------------------------------------------------

  /** Zonas con espacios libres por tipo de vehículo, la tarifa y el precio de la reserva. */
  async disponibilidad(eventoId: string, llegadaPedida?: string) {
    await this.expirarVencidas();
    const evento = await this.eventoReservable(eventoId);
    const llegada = this.llegada(evento, llegadaPedida);
    const tarifa = await this.cobro.tarifaVigente(this.datos.manager);
    const [zonas, ...porTipo] = await Promise.all([
      this.datos.query(`SELECT id, nombre, capacidad, orden FROM zonas_parqueadero WHERE evento_id = $1 ORDER BY orden, nombre`, [eventoId]),
      ...TIPOS_VEHICULO.map((tipo) => this.asignacion.conEspacio(this.datos.manager, eventoId, tipo)),
    ]) as [{ id: string; nombre: string; capacidad: number }[], ...{ id: string; disponibles: number }[][]];
    const horas = horasEntre(llegada, evento.fechaFin);
    const libres = (i: number, zonaId: string) => porTipo[i].find((z) => z.id === zonaId)?.disponibles ?? 0;
    const lista = zonas.map((z) => ({
      id: z.id, nombre: z.nombre, capacidad: z.capacidad,
      disponibles: Object.fromEntries(TIPOS_VEHICULO.map((tipo, i) => [tipo, libres(i, z.id)])) as Record<TipoVehiculo, number>,
    }));
    return {
      evento: { id: evento.id, nombre: evento.nombre, fechaInicio: evento.fechaInicio, fechaFin: evento.fechaFin },
      llegada,
      tarifa: tarifa ? { valorHora: tarifa.valorHora } : null,
      horas,
      precio: tarifa ? horas * tarifa.valorHora : null,
      minutosParaPagar: MINUTOS_PARA_PAGAR,
      reservable: !!tarifa && lista.some((z) => Object.values(z.disponibles).some((n) => n > 0)),
      motivo: !tarifa ? 'Todavía no hay tarifa de parqueadero: no se puede reservar.' : null,
      zonas: lista,
    };
  }

  // --- Pasos 3-4: reservar --------------------------------------------------------

  async reservar(eventoId: string, dto: ReservarDto, clienteId: string) {
    await this.expirarVencidas();
    const evento = await this.eventoReservable(eventoId);
    const llegada = this.llegada(evento, dto.llegada);
    const placa = normalizarPlaca(dto.placa);
    const tipo = dto.tipoVehiculo ?? 'AUTOMOVIL';

    const id = await this.datos.transaction(async (m) => {
      const tarifa = await this.cobro.tarifaVigente(m);
      if (!tarifa) throw new ConflictException({ codigo: 'SIN_TARIFA', mensaje: 'Todavía no hay tarifa de parqueadero: no se puede reservar.' });
      const zona = await this.asignacion.bloquearZona(m, eventoId, dto.zonaId);
      const espacio = await this.asignacion.elegir(m, zona.id, tipo);
      if (!espacio) {
        // CU-021A: sin disponibilidad, las zonas que sí tienen.
        throw new ConflictException({
          codigo: 'CU-021A',
          mensaje: `«${zona.nombre}» no tiene espacios libres para ${nombreTipo(tipo)}.`,
          alternativas: await this.asignacion.conEspacio(m, eventoId, tipo, zona.id),
        });
      }
      const horas = horasEntre(llegada, evento.fechaFin);
      let reservaId: string;
      try {
        [{ id: reservaId }] = await m.query(
          `INSERT INTO reservas (evento_id, zona_id, espacio_id, cliente_id, placa, tipo_vehiculo, llegada_estimada, tarifa_id, valor_hora, horas, monto, expira_en)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, now() + make_interval(mins => $12)) RETURNING id`,
          [eventoId, zona.id, espacio.id, clienteId, placa, tipo, llegada, tarifa.id, tarifa.valorHora, horas, horas * tarifa.valorHora, MINUTOS_PARA_PAGAR]);
      } catch (error) {
        if (error instanceof QueryFailedError && (error as QueryFailedError & { driverError?: { constraint?: string } }).driverError?.constraint === 'UQ_reservas_placa_activa') {
          throw new ConflictException({ codigo: 'PLACA_CON_RESERVA', mensaje: `El vehículo ${placa} ya tiene una reserva para este evento.` });
        }
        throw error;
      }
      await this.asignacion.registrar(m, {
        eventoId, zonaId: zona.id, espacioId: espacio.id, origen: 'RESERVA', placa, tipo, reservaId, detalle: 'Reserva pendiente de pago', usuario: clienteId,
      });
      return reservaId;
    });

    const reserva = await this.leer(this.datos.manager, id);
    await this.conRedis((r) => r.set(llaveBloqueo(reserva.espacioId), reserva.id, 'PX', Math.max(1, new Date(reserva.expiraEn).getTime() - Date.now())));
    return this.vista(reserva, evento);
  }

  // --- Pasos 5-9: pagar ----------------------------------------------------------

  async pagar(reservaId: string, token: string, clienteId: string) {
    const { reserva, vencida } = await this.datos.transaction(async (m) => {
      const [actual] = await m.query(`SELECT ${COLUMNAS_RESERVA} ${DESDE_RESERVA} WHERE r.id = $1 AND r.cliente_id = $2 FOR UPDATE OF r`, [reservaId, clienteId]);
      if (!actual) throw new NotFoundException({ codigo: 'RESERVA_NO_ENCONTRADA', mensaje: 'La reserva no existe.' });
      if (actual.estado === 'EXPIRADA') return { reserva: actual as Reserva, vencida: true };
      if (actual.estado === 'CONFIRMADA' || actual.estado === 'USADA') return { reserva: actual as Reserva, vencida: false };
      // CU-021C: se venció y el barrido aún no pasó.
      if (actual.estado === 'PENDIENTE_PAGO' && new Date(actual.expiraEn) <= new Date()) {
        await this.expirar(m, [actual.id]);
        return { reserva: actual as Reserva, vencida: true };
      }
      await m.query(`UPDATE reservas SET estado = 'PAGANDO' WHERE id = $1`, [actual.id]);
      return { reserva: actual as Reserva, vencida: false };
    });
    if (vencida) {
      throw new ConflictException({ codigo: 'CU-021C', mensaje: 'El tiempo para pagar se acabó y el espacio se liberó. Puedes volver a reservar.' });
    }
    if (reserva.estado === 'CONFIRMADA' || reserva.estado === 'USADA') return this.detalle(reserva.id, clienteId);

    const cobro = await this.cobrar(reserva, token);
    if (cobro.resultado === ResultadoCobro.RECHAZADO) {
      // CU-021B: el espacio sigue retenido y se puede reintentar con otro medio de pago.
      const motivo = cobro.motivo ?? 'La pasarela rechazó el cobro';
      await this.datos.query(
        `UPDATE reservas SET estado = 'PENDIENTE_PAGO', intentos_rechazados = intentos_rechazados + 1, motivo = $2 WHERE id = $1 AND estado = 'PAGANDO'`,
        [reserva.id, motivo]);
      throw new ConflictException({
        codigo: 'CU-021B',
        mensaje: `El pago fue rechazado: ${motivo}. Puedes intentarlo con otro medio de pago.`,
        motivo, reservaHasta: new Date(reserva.expiraEn).toISOString(),
      });
    }
    if (cobro.resultado !== ResultadoCobro.APROBADO || !cobro.referencia) {
      // No se sabe si se cobró: la reserva queda PAGANDO (fuera del barrido) hasta que se reintente con la misma clave.
      await this.datos.query(`UPDATE reservas SET motivo = $2 WHERE id = $1`, [reserva.id, cobro.motivo]);
      this.log.error(`Pago de la reserva ${reserva.id} INDETERMINADO: ${cobro.motivo}. Requiere conciliación.`);
      throw new ServiceUnavailableException({
        codigo: 'PAGO_INDETERMINADO',
        mensaje: 'No pudimos confirmar el pago con la pasarela. Reintentar es seguro y no cobra dos veces.',
        requiereConciliacion: true,
      });
    }

    // Pasos 6-8: pagada; el QR identifica la reserva en el punto de control.
    await this.datos.transaction(async (m) => {
      const codigo = `HXP-${Array.from(randomBytes(16), (b) => ALFABETO_QR[b % ALFABETO_QR.length]).join('')}`;
      const [, confirmadas] = await m.query(
        `UPDATE reservas SET estado = 'CONFIRMADA', codigo_qr = $2, referencia_pago = $3, confirmada_en = now(), motivo = NULL WHERE id = $1 AND estado = 'PAGANDO'`,
        [reserva.id, codigo, cobro.referencia]);
      if (!confirmadas) return;
      const { evento } = await this.eventos.detalle(reserva.eventoId);
      // Paso 9: la confirmación con el QR, en la misma transacción (bandeja de salida).
      await m.query(`INSERT INTO notificaciones_reserva (reserva_id, cliente_id, mensaje) VALUES ($1, $2, $3)`, [reserva.id, clienteId,
        `Reserva confirmada: ${evento.nombre}, ${reserva.zona} espacio ${reserva.espacio}, placa ${reserva.placa}. ` +
        `Total ${Math.round(reserva.monto)} COP. Tu código de acceso: ${codigo}`]);
    });
    await this.conRedis((r) => r.del(llaveBloqueo(reserva.espacioId)));
    void this.notificador.despachar();
    return this.detalle(reserva.id, clienteId);
  }

  private async cobrar(reserva: Reserva, token: string) {
    try {
      const dto = await validarSolicitudPagos(CobrarDto, {
        claveIdempotencia: `parqueadero-${reserva.id}-${reserva.intentosRechazados}`, solicitante: 'parqueaderos',
        monto: reserva.monto, moneda: 'COP', token, descripcion: `Reserva de parqueadero ${reserva.placa}`,
      });
      return await this.pagos.cobrar(dto);
    } catch (error) {
      if (error instanceof HttpException && error.getStatus() === 400) {
        await this.datos.query(`UPDATE reservas SET estado = 'PENDIENTE_PAGO' WHERE id = $1 AND estado = 'PAGANDO'`, [reserva.id]);
        throw new BadRequestException({ codigo: 'TOKEN_INVALIDO', mensaje: 'El medio de pago no es válido.' });
      }
      return { resultado: ResultadoCobro.INDETERMINADO, referencia: null, motivo: 'PAGOS_ERROR', repetida: false };
    }
  }

  // --- Consultas del cliente -----------------------------------------------------

  async mias(clienteId: string) {
    await this.expirarVencidas();
    const reservas: Reserva[] = await this.datos.query(`SELECT ${COLUMNAS_RESERVA} ${DESDE_RESERVA} WHERE r.cliente_id = $1 ORDER BY r.creada_en DESC LIMIT 100`, [clienteId]);
    const eventos = new Map(await Promise.all([...new Set(reservas.map((r) => r.eventoId))]
      .map(async (id) => [id, await this.eventos.detalle(id).then((d) => d.evento).catch(() => null)] as const)));
    return reservas.map((r) => this.vista(r, eventos.get(r.eventoId) ?? null));
  }

  async detalle(reservaId: string, clienteId: string) {
    const [reserva] = await this.datos.query(`SELECT ${COLUMNAS_RESERVA} ${DESDE_RESERVA} WHERE r.id = $1 AND r.cliente_id = $2`, [reservaId, clienteId]);
    if (!reserva) throw new NotFoundException({ codigo: 'RESERVA_NO_ENCONTRADA', mensaje: 'La reserva no existe.' });
    const { evento } = await this.eventos.detalle(reserva.eventoId);
    return this.vista(reserva, evento);
  }

  /** Para el organizador: las reservas del evento. */
  delEvento(eventoId: string) {
    return this.datos.query(
      `SELECT ${COLUMNAS_RESERVA.replace(', r.codigo_qr AS "codigoQr"', '')} ${DESDE_RESERVA} WHERE r.evento_id = $1 ORDER BY r.creada_en DESC LIMIT 500`, [eventoId]);
  }

  // --- CU-021C: vencimiento -------------------------------------------------------

  /** Libera las reservas que no se pagaron a tiempo. Una pasada a la vez por proceso. */
  expirarVencidas(): Promise<number> {
    if (this.barriendo) return this.barriendo;
    this.barriendo = this.datos.transaction(async (m) => {
      const vencidas: { id: string }[] = await m.query(
        `SELECT id FROM reservas WHERE estado = 'PENDIENTE_PAGO' AND expira_en <= now() ORDER BY expira_en LIMIT 200 FOR UPDATE SKIP LOCKED`);
      return vencidas.length ? this.expirar(m, vencidas.map((v) => v.id)) : 0;
    }).catch((error: Error) => {
      this.log.warn(`Barrido de reservas vencidas aplazado: ${error.message}`);
      return 0;
    }).finally(() => { this.barriendo = null; });
    return this.barriendo;
  }

  private async expirar(m: EntityManager, ids: string[]) {
    const [liberadas] = await m.query(
      `UPDATE reservas SET estado = 'EXPIRADA', motivo = coalesce(motivo, 'No se pagó a tiempo') WHERE id = ANY($1::uuid[]) AND estado = 'PENDIENTE_PAGO'
       RETURNING id, evento_id AS "eventoId", zona_id AS "zonaId", espacio_id AS "espacioId", placa, tipo_vehiculo AS "tipoVehiculo", cliente_id AS "clienteId"`,
      [ids]) as [{ id: string; eventoId: string; zonaId: string; espacioId: string; placa: string; tipoVehiculo: TipoVehiculo; clienteId: string }[], number];
    for (const r of liberadas) {
      await this.asignacion.registrar(m, {
        eventoId: r.eventoId, zonaId: r.zonaId, espacioId: r.espacioId, origen: 'LIBERACION', placa: r.placa, tipo: r.tipoVehiculo,
        reservaId: r.id, detalle: 'Reserva vencida sin pagar', usuario: r.clienteId,
      });
    }
    if (liberadas.length) {
      await this.conRedis((r) => r.del(...liberadas.map((x) => llaveBloqueo(x.espacioId))));
      this.log.log(`${liberadas.length} reservas de parqueadero vencidas sin pagar; espacios liberados.`);
    }
    return liberadas.length;
  }

  // --- Apoyo --------------------------------------------------------------------

  private async eventoReservable(eventoId: string) {
    const { evento } = await this.eventos.detalle(eventoId);
    if (evento.estado !== 'PUBLICADO') throw new ConflictException({ codigo: 'EVENTO_NO_PUBLICADO', mensaje: 'El evento no está publicado.' });
    if (evento.fechaFin <= new Date()) throw new ConflictException({ codigo: 'EVENTO_TERMINADO', mensaje: 'El evento ya terminó.' });
    return evento;
  }

  /** La llegada prevista: sin ella, el inicio del evento (o ahora, si ya empezó). */
  private llegada(evento: { fechaInicio: Date; fechaFin: Date }, pedida?: string) {
    const ahora = Date.now();
    const llegada = pedida ? new Date(pedida) : new Date(Math.max(ahora, new Date(evento.fechaInicio).getTime()));
    if (llegada.getTime() < ahora - TOLERANCIA_LLEGADA_MIN * 60_000 || llegada >= evento.fechaFin) {
      throw new BadRequestException({ codigo: 'LLEGADA_INVALIDA', mensaje: 'La hora de llegada debe estar entre ahora y el final del evento.' });
    }
    return llegada;
  }

  private async leer(m: EntityManager, id: string): Promise<Reserva> {
    const [reserva] = await m.query(`SELECT ${COLUMNAS_RESERVA} ${DESDE_RESERVA} WHERE r.id = $1`, [id]);
    return reserva;
  }

  private vista(r: Reserva, evento: { id: string; nombre: string; fechaInicio: Date; fechaFin: Date } | null) {
    const { clienteId: _cliente, intentosRechazados: _intentos, ...resto } = r;
    return {
      ...resto,
      codigoQr: r.estado === 'CONFIRMADA' || r.estado === 'USADA' ? r.codigoQr : null,
      evento: evento ? { id: evento.id, nombre: evento.nombre, fechaInicio: evento.fechaInicio, fechaFin: evento.fechaFin } : null,
      segundosParaPagar: r.estado === 'PENDIENTE_PAGO' ? Math.max(0, Math.round((new Date(r.expiraEn).getTime() - Date.now()) / 1000)) : null,
    };
  }

  /** Redis es una ayuda, no la garantía: si falla, se sigue con la base. */
  private async conRedis(accion: (r: Redis) => Promise<unknown>) {
    try {
      await accion(this.redis);
    } catch (error) {
      this.log.warn(`Bloqueo temporal en Redis no disponible; sigue la garantía de la base: ${(error as Error).message}`);
    }
  }
}
