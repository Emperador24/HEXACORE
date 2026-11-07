import { BadRequestException, ConflictException, HttpException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { createHash } from 'node:crypto';
import { DataSource, EntityManager, QueryFailedError } from 'typeorm';
import { EventosService } from '../../eventos-recintos/eventos/eventos.service';
import { Asignacion, AsignacionService } from '../asignacion/asignacion.service';
import { COLUMNAS_ESTANCIA, CobroService, Estancia, cobroDe } from '../cobro/cobro.service';
import { TipoVehiculo, normalizarPlaca } from '../comun/vehiculos';
import { RegistroLocalDto } from '../dto/parqueaderos.dto';
import { OcupacionService } from '../ocupacion/ocupacion.service';
import { CONEXION_PARQUEADEROS } from '../persistencia/conexion';

/** Una salida repetida dentro de este margen devuelve la misma salida (reintento del dispositivo). */
const MARGEN_SALIDA_REPETIDA_MIN = 10;
/** Lo registrado sin red se acepta hasta con este atraso, y con este adelanto de reloj. */
const ATRASO_MAXIMO_H = 48;
const ADELANTO_MAXIMO_MIN = 5;

export interface DatosIngreso {
  placa?: string; codigoQr?: string; tipoVehiculo?: TipoVehiculo; zonaId?: string; espacio?: string;
  /** Solo en la sincronización: el id del registro en el dispositivo y cuándo ocurrió. */
  registroLocalId?: string; ocurridoEn?: Date;
}

export interface DatosSalida { placa?: string; codigoQr?: string; salidaLocalId?: string; ocurridoEn?: Date }

interface ReservaLeida {
  id: string; eventoId: string; zonaId: string; espacioId: string; espacio: string; placa: string; tipoVehiculo: TipoVehiculo; estado: string;
}

/** El hash con que el punto de control reconoce un QR sin conocerlo (caché local). */
export const hashQr = (codigo: string) => createHash('sha256').update(codigo.trim().toUpperCase()).digest('hex');

const esUnico = (error: unknown, restriccion?: string) =>
  error instanceof QueryFailedError && (error as QueryFailedError & { driverError?: { code?: string; constraint?: string } }).driverError?.code === '23505'
  && (!restriccion || (error as QueryFailedError & { driverError?: { constraint?: string } }).driverError?.constraint === restriccion);

/**
 * CU-022: Ingreso y salida de vehículos.
 *
 * El punto de control lee el QR de la reserva o la placa. Con reserva pagada
 * (CU-021) el vehículo va a su espacio y no paga al salir (CU-024A); sin
 * reserva, CU-022A, entra si hay cupo y CU-023 le asigna espacio. La salida
 * libera el espacio y calcula el cobro (CU-024). Ingreso y salida actualizan
 * la ocupación por construcción: se calcula de las estancias abiertas (CU-025).
 *
 * Infraestructura no trivial (offline-first): el dispositivo baja una caché
 * con los QR vigentes (solo su hash) y la ocupación, registra lo que pase sin
 * red con su propio id y la hora real, y lo sincroniza al volver. El id local
 * hace idempotente el reenvío.
 */
@Injectable()
export class AccesosService {
  constructor(
    @InjectDataSource(CONEXION_PARQUEADEROS) private readonly datos: DataSource,
    private readonly eventos: EventosService,
    private readonly ocupacion: OcupacionService,
    private readonly asignacion: AsignacionService,
    private readonly cobro: CobroService,
  ) {}

  // --- Ingreso (pasos 1-4) --------------------------------------------------------

  async registrarIngreso(eventoId: string, d: DatosIngreso, usuario: string) {
    if (!d.placa && !d.codigoQr) throw new BadRequestException({ codigo: 'PLACA_O_QR', mensaje: 'Presenta el QR de la reserva o la placa del vehículo.' });
    if (d.espacio && !d.zonaId) throw new BadRequestException({ codigo: 'ESPACIO_SIN_ZONA', mensaje: 'Para pedir un espacio indica también su zona.' });
    const { evento } = await this.eventos.detalle(eventoId);
    if (evento.estado !== 'PUBLICADO') throw new ConflictException({ codigo: 'EVENTO_NO_PUBLICADO', mensaje: 'El evento no está publicado.' });
    if (evento.fechaFin <= (d.ocurridoEn ?? new Date())) throw new ConflictException({ codigo: 'EVENTO_TERMINADO', mensaje: 'El evento ya terminó.' });

    if (d.registroLocalId) {
      const previa = await this.porRegistroLocal(d.registroLocalId);
      if (previa) return { ...(await this.respuestaIngreso(eventoId, previa, null)), repetida: true };
    }

    let resultado: { id: string; asignacion: Asignacion; reservaId: string | null };
    try {
      resultado = await this.datos.transaction((m) => this.ingresar(m, eventoId, d, usuario));
    } catch (error) {
      // El mismo registro llegó dos veces a la vez: gana el primero.
      if (d.registroLocalId && esUnico(error, 'UQ_estancias_registro_local')) {
        return { ...(await this.respuestaIngreso(eventoId, (await this.porRegistroLocal(d.registroLocalId))!, null)), repetida: true };
      }
      throw error;
    }
    return { ...(await this.respuestaIngreso(eventoId, resultado.id, resultado.asignacion, resultado.reservaId)), repetida: false };
  }

  private async ingresar(m: EntityManager, eventoId: string, d: DatosIngreso, usuario: string) {
    // Paso 2: la reserva asociada, por su QR o por la placa.
    let reserva: ReservaLeida | undefined;
    if (d.codigoQr) {
      [reserva] = await m.query(`${SELECT_RESERVA} WHERE r.codigo_qr = $1 FOR UPDATE OF r`, [d.codigoQr.trim().toUpperCase()]);
      // CU-022B: un QR que no es de una reserva pagada de este evento no abre la barrera.
      if (!reserva || reserva.eventoId !== eventoId) {
        throw new UnprocessableEntityException({ codigo: 'QR_INVALIDO', mensaje: 'El QR no corresponde a una reserva de este evento: ingreso negado.' });
      }
      if (reserva.estado === 'USADA') throw new ConflictException({ codigo: 'RESERVA_YA_USADA', mensaje: `La reserva de ${reserva.placa} ya se usó para entrar.` });
      if (reserva.estado !== 'CONFIRMADA') {
        throw new UnprocessableEntityException({ codigo: 'QR_INVALIDO', mensaje: 'La reserva no está pagada o ya venció: ingreso negado.' });
      }
      if (d.placa && normalizarPlaca(d.placa) !== reserva.placa) {
        throw new ConflictException({ codigo: 'PLACA_NO_COINCIDE', mensaje: `El QR es de la placa ${reserva.placa}, no de ${normalizarPlaca(d.placa)}.` });
      }
    } else {
      [reserva] = await m.query(`${SELECT_RESERVA} WHERE r.evento_id = $1 AND r.placa = $2 AND r.estado = 'CONFIRMADA' FOR UPDATE OF r`,
        [eventoId, normalizarPlaca(d.placa!)]);
    }
    const placa = reserva?.placa ?? normalizarPlaca(d.placa!);
    const tipo = reserva?.tipoVehiculo ?? d.tipoVehiculo ?? 'AUTOMOVIL';

    // Paso 4 / CU-023: con reserva, su espacio; sin ella (CU-022A), el que asigne el sistema si hay cupo (CU-022C si no).
    let asignacion: Asignacion;
    if (reserva) {
      const zona = await this.asignacion.bloquearZona(m, eventoId, reserva.zonaId);
      asignacion = { zona, espacio: { id: reserva.espacioId, codigo: reserva.espacio, tipo }, reasignado: false, detalle: null };
    } else {
      asignacion = await this.asignacion.asignar(m, eventoId, { zonaId: d.zonaId, tipo, codigo: d.espacio });
    }

    // Paso 3: hora de ingreso; la ocupación de la zona cambia con esta fila.
    let id: string;
    try {
      [{ id }] = await m.query(
        `INSERT INTO estancias (evento_id, zona_id, espacio_id, espacio, placa, tipo_vehiculo, reserva_id, prepagada, ingreso_en, ingreso_por, registro_local_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, coalesce($9::timestamptz, now()), $10, $11) RETURNING id`,
        [eventoId, asignacion.zona.id, asignacion.espacio.id, asignacion.espacio.codigo, placa, tipo, reserva?.id ?? null, !!reserva,
          d.ocurridoEn ?? null, usuario, d.registroLocalId ?? null]);
    } catch (error) {
      if (esUnico(error, 'UQ_estancias_placa_en_lote')) {
        throw new ConflictException({ codigo: 'VEHICULO_EN_LOTE', mensaje: `El vehículo ${placa} ya está dentro del parqueadero.` });
      }
      throw error;
    }
    if (reserva) {
      await m.query(`UPDATE reservas SET estado = 'USADA', usada_en = (SELECT ingreso_en FROM estancias WHERE id = $2), estancia_id = $2 WHERE id = $1`, [reserva.id, id]);
    }
    await this.asignacion.registrar(m, {
      eventoId, zonaId: asignacion.zona.id, espacioId: asignacion.espacio.id, origen: asignacion.reasignado ? 'REASIGNACION' : 'INGRESO',
      placa, tipo, reservaId: reserva?.id, estanciaId: id, detalle: asignacion.detalle ?? (reserva ? 'Ingreso con reserva' : 'Ingreso sin reserva'), usuario,
    });
    return { id, asignacion, reservaId: reserva?.id ?? null };
  }

  private async respuestaIngreso(eventoId: string, id: string, asignacion: Asignacion | null, reservaId: string | null = null) {
    const estancia = await this.estancia(this.datos.manager, id);
    const recomendada = (await this.ocupacion.recomendacion(this.datos.manager, eventoId)).zona;
    return {
      estancia,
      // Paso 4: lo que el operador le indica al conductor.
      asignacion: {
        zona: estancia.zona, espacio: estancia.espacio, conReserva: !!(reservaId ?? estancia.reservaId),
        reasignado: asignacion?.reasignado ?? false, detalle: asignacion?.detalle ?? null,
      },
      recomendada,
    };
  }

  // --- Salida (pasos 5-9) ---------------------------------------------------------

  /**
   * La salida se registra **siempre**: si no hay tarifa vigente, el cobro queda
   * pendiente en vez de impedir que el vehículo salga. Un reintento poco
   * después devuelve la misma salida; con id local, siempre.
   */
  async registrarSalida(eventoId: string, d: DatosSalida, usuario: string) {
    if (!d.placa && !d.codigoQr) throw new BadRequestException({ codigo: 'PLACA_O_QR', mensaje: 'Presenta el QR de la reserva o la placa del vehículo.' });
    let placa = d.placa ? normalizarPlaca(d.placa) : null;
    if (d.codigoQr) {
      const [reserva] = await this.datos.query(`SELECT placa FROM reservas WHERE codigo_qr = $1 AND evento_id = $2`, [d.codigoQr.trim().toUpperCase(), eventoId]);
      if (!reserva) throw new UnprocessableEntityException({ codigo: 'QR_INVALIDO', mensaje: 'El QR no corresponde a una reserva de este evento.' });
      placa = reserva.placa;
    }
    if (d.salidaLocalId) {
      const [previa] = await this.datos.query(`SELECT id FROM estancias WHERE salida_local_id = $1`, [d.salidaLocalId]);
      if (previa) return this.respuestaSalida(previa.id, true);
    }

    const resultado = await this.datos.transaction(async (m) => {
      const [abierta] = await m.query(
        `SELECT id, zona_id AS "zonaId", espacio_id AS "espacioId", tipo_vehiculo AS "tipoVehiculo", reserva_id AS "reservaId", prepagada, ingreso_en AS "ingresoEn"
           FROM estancias WHERE evento_id = $1 AND placa = $2 AND salida_en IS NULL FOR UPDATE`, [eventoId, placa]);
      if (!abierta) {
        const [reciente] = await m.query(
          `SELECT id FROM estancias WHERE evento_id = $1 AND placa = $2 AND salida_en > now() - make_interval(mins => $3) ORDER BY salida_en DESC LIMIT 1`,
          [eventoId, placa, MARGEN_SALIDA_REPETIDA_MIN]);
        if (reciente) return { id: reciente.id as string, repetida: true };
        throw new NotFoundException({ codigo: 'VEHICULO_NO_EN_LOTE', mensaje: `El vehículo ${placa} no figura dentro del parqueadero de este evento.` });
      }

      // Pasos 6-8: hora de salida (nunca antes del ingreso) y permanencia. En Postgres, TypeORM devuelve [filas, cantidad] para un UPDATE.
      const [[{ salida }]] = await m.query(
        `UPDATE estancias SET salida_en = greatest(coalesce($3::timestamptz, now()), ingreso_en), salida_por = $2, salida_local_id = $4
          WHERE id = $1 RETURNING salida_en AS salida`, [abierta.id, usuario, d.ocurridoEn ?? null, d.salidaLocalId ?? null]);
      await this.cobro.liquidar(m, abierta, salida);
      // Paso 9: el espacio queda libre; se anota en el historial de la zona.
      if (abierta.espacioId) {
        await this.asignacion.registrar(m, {
          eventoId, zonaId: abierta.zonaId, espacioId: abierta.espacioId, origen: 'LIBERACION', placa: placa!, tipo: abierta.tipoVehiculo,
          reservaId: abierta.reservaId, estanciaId: abierta.id, detalle: 'Salida', usuario,
        });
      }
      return { id: abierta.id as string, repetida: false };
    });
    return this.respuestaSalida(resultado.id, resultado.repetida);
  }

  private async respuestaSalida(id: string, repetida: boolean) {
    const estancia = await this.estancia(this.datos.manager, id);
    const permanenciaMinutos = estancia.salidaEn ? Math.round((new Date(estancia.salidaEn).getTime() - new Date(estancia.ingresoEn).getTime()) / 60_000) : null;
    return { estancia, cobro: cobroDe(estancia), permanenciaMinutos, repetida };
  }

  async vehiculos(eventoId: string, soloEnLote: boolean) {
    return this.datos.query(
      `SELECT ${COLUMNAS_ESTANCIA} FROM estancias e JOIN zonas_parqueadero z ON z.id = e.zona_id
        WHERE e.evento_id = $1 ${soloEnLote ? 'AND e.salida_en IS NULL' : ''} ORDER BY e.ingreso_en DESC LIMIT 500`, [eventoId]);
  }

  // --- Offline-first del punto de control ------------------------------------------

  /**
   * Lo que el dispositivo guarda para seguir validando sin red: el hash de cada
   * QR vigente (nunca el código), su placa, zona y espacio, los vehículos
   * dentro y la ocupación por zona.
   */
  async cache(eventoId: string) {
    const { evento } = await this.eventos.detalle(eventoId);
    const [reservas, dentro, zonas, tarifa] = await Promise.all([
      this.datos.query(
        `SELECT r.codigo_qr, r.placa, r.tipo_vehiculo AS "tipoVehiculo", r.zona_id AS "zonaId", z.nombre AS zona, s.codigo AS espacio, r.estado
           FROM reservas r JOIN zonas_parqueadero z ON z.id = r.zona_id JOIN espacios s ON s.id = r.espacio_id
          WHERE r.evento_id = $1 AND r.estado IN ('CONFIRMADA', 'USADA')`, [eventoId]),
      this.datos.query(`SELECT placa FROM estancias WHERE evento_id = $1 AND salida_en IS NULL`, [eventoId]),
      this.ocupacion.estadoZonas(this.datos.manager, eventoId),
      this.cobro.tarifaVigente(this.datos.manager),
    ]);
    return {
      evento: { id: evento.id, nombre: evento.nombre, fechaFin: evento.fechaFin },
      generadoEn: new Date(),
      reservas: reservas.map(({ codigo_qr, ...r }: { codigo_qr: string }) => ({ hashQr: hashQr(codigo_qr), ...r })),
      enLote: dentro.map((e: { placa: string }) => e.placa),
      zonas: zonas.map(({ id, nombre, capacidad, ocupados, reservados, disponibles, estado }) => ({ id, nombre, capacidad, ocupados, reservados, disponibles, estado })),
      tarifa,
    };
  }

  /**
   * Aplica en orden cronológico lo registrado sin red. Cada registro responde
   * por sí solo: uno rechazado (QR inválido, lote lleno) no detiene los demás,
   * y uno ya aplicado se reconoce por su id y no se repite.
   */
  async sincronizar(eventoId: string, registros: RegistroLocalDto[], usuario: string) {
    const ahora = Date.now();
    const ordenados = [...registros].sort((a, b) => Date.parse(a.ocurridoEn) - Date.parse(b.ocurridoEn));
    const resultados = [];
    for (const r of ordenados) {
      const ocurridoEn = new Date(r.ocurridoEn);
      try {
        if (ocurridoEn.getTime() > ahora + ADELANTO_MAXIMO_MIN * 60_000 || ocurridoEn.getTime() < ahora - ATRASO_MAXIMO_H * 3_600_000) {
          throw new BadRequestException({ codigo: 'HORA_FUERA_DE_RANGO', mensaje: 'La hora del registro no es creíble: revisa el reloj del dispositivo.' });
        }
        if (r.tipo === 'INGRESO') {
          const hecho = await this.registrarIngreso(eventoId, { ...r, registroLocalId: r.id, ocurridoEn }, usuario);
          resultados.push({ id: r.id, tipo: r.tipo, resultado: hecho.repetida ? 'REPETIDO' : 'APLICADO', estanciaId: hecho.estancia.id, asignacion: hecho.asignacion });
        } else {
          const hecho = await this.registrarSalida(eventoId, { placa: r.placa, codigoQr: r.codigoQr, salidaLocalId: r.id, ocurridoEn }, usuario);
          resultados.push({ id: r.id, tipo: r.tipo, resultado: hecho.repetida ? 'REPETIDO' : 'APLICADO', estanciaId: hecho.estancia.id, cobro: hecho.cobro });
        }
      } catch (error) {
        if (!(error instanceof HttpException)) throw error;
        const cuerpo = error.getResponse() as { codigo?: string; mensaje?: string };
        resultados.push({ id: r.id, tipo: r.tipo, resultado: 'RECHAZADO', codigo: cuerpo.codigo ?? 'RECHAZADO', mensaje: cuerpo.mensaje ?? error.message });
      }
    }
    return {
      aplicados: resultados.filter((r) => r.resultado === 'APLICADO').length,
      repetidos: resultados.filter((r) => r.resultado === 'REPETIDO').length,
      rechazados: resultados.filter((r) => r.resultado === 'RECHAZADO').length,
      resultados,
    };
  }

  // --- Apoyo --------------------------------------------------------------------

  private async porRegistroLocal(registroLocalId: string): Promise<string | null> {
    const [fila] = await this.datos.query(`SELECT id FROM estancias WHERE registro_local_id = $1`, [registroLocalId]);
    return fila?.id ?? null;
  }

  private async estancia(m: EntityManager, id: string): Promise<Estancia> {
    const [fila] = await m.query(`SELECT ${COLUMNAS_ESTANCIA} FROM estancias e JOIN zonas_parqueadero z ON z.id = e.zona_id WHERE e.id = $1`, [id]);
    return fila;
  }
}

const SELECT_RESERVA = `SELECT r.id, r.evento_id AS "eventoId", r.zona_id AS "zonaId", r.espacio_id AS "espacioId", s.codigo AS espacio, r.placa,
  r.tipo_vehiculo AS "tipoVehiculo", r.estado FROM reservas r JOIN espacios s ON s.id = r.espacio_id`;
