import { ConflictException, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager, QueryFailedError } from 'typeorm';
import { EventosService } from '../../eventos-recintos/eventos/eventos.service';
import { AsignacionService, prefijoDe } from '../asignacion/asignacion.service';
import { ActualizarZonaDto, DefinirTarifaDto, GuardarZonaDto } from '../dto/parqueaderos.dto';
import { OcupacionService } from '../ocupacion/ocupacion.service';
import { CONEXION_PARQUEADEROS } from '../persistencia/conexion';

export const HORA_MS = 3_600_000;

export interface Estancia {
  id: string; eventoId: string; zonaId: string; zona: string; placa: string; espacio: string | null; espacioId: string | null;
  tipoVehiculo: string; reservaId: string | null; prepagada: boolean; ingresoEn: Date; salidaEn: Date | null;
  valorHora: number | null; horasCobradas: number | null; monto: number | null;
}

export interface Cobro {
  /** CU-024A: la reserva ya estaba pagada y no se calcula nada. */
  prepagada: boolean;
  /** Sin tarifa vigente: la salida queda registrada y el cobro pendiente (RNF de disponibilidad). */
  pendiente: boolean;
  horas: number | null;
  valorHora: number | null;
  monto: number | null;
  /** Lo que el personal le dice al cliente, de un vistazo (RNF de usabilidad). */
  mensaje: string;
}

export const COLUMNAS_ESTANCIA = `e.id, e.evento_id AS "eventoId", e.zona_id AS "zonaId", z.nombre AS zona, e.placa, e.espacio, e.espacio_id AS "espacioId",
  e.tipo_vehiculo AS "tipoVehiculo", e.reserva_id AS "reservaId", e.prepagada, e.ingreso_en AS "ingresoEn", e.salida_en AS "salidaEn",
  e.valor_hora::float AS "valorHora", e.horas_cobradas AS "horasCobradas", e.monto::float AS monto`;

const pesos = (valor: number) => `$${Math.round(valor).toLocaleString('es-CO')}`;

/** Horas cobradas: redondeadas hacia arriba, mínimo una (CU-024, paso 5; también el precio de la reserva). */
export const horasEntre = (desde: Date, hasta: Date) => Math.max(1, Math.ceil((hasta.getTime() - desde.getTime()) / HORA_MS));

/**
 * CU-024: Cobro. También lo que necesita para existir: las zonas del
 * parqueadero de cada evento, con sus espacios (CU-023), y la tarifa
 * centralizada. El ingreso y la salida son de `AccesosService` (CU-022), que
 * llama a `liquidar` al registrar la salida.
 */
@Injectable()
export class CobroService {
  constructor(
    @InjectDataSource(CONEXION_PARQUEADEROS) private readonly datos: DataSource,
    private readonly eventos: EventosService,
    private readonly ocupacion: OcupacionService,
    private readonly asignacion: AsignacionService,
  ) {}

  // --- Tarifa (la define el Administrador) -------------------------------------

  async tarifa() {
    const historial = await this.datos.query(
      `SELECT id, valor_hora::float AS "valorHora", vigente_desde AS "vigenteDesde", definida_por AS "definidaPor", motivo
         FROM tarifas ORDER BY vigente_desde DESC LIMIT 20`);
    return { vigente: historial.find((t: { vigenteDesde: Date }) => t.vigenteDesde <= new Date()) ?? null, historial };
  }

  /** La tarifa que rige en un momento: la última cuyo `vigente_desde` ya pasó. */
  async tarifaVigente(m: EntityManager, en?: Date): Promise<{ id: string; valorHora: number } | null> {
    const [tarifa] = await m.query(
      `SELECT id, valor_hora::float AS "valorHora" FROM tarifas WHERE vigente_desde <= coalesce($1::timestamptz, now()) ORDER BY vigente_desde DESC LIMIT 1`, [en ?? null]);
    return tarifa ?? null;
  }

  async definirTarifa(dto: DefinirTarifaDto, usuario: string) {
    await this.datos.query(`INSERT INTO tarifas (valor_hora, definida_por, motivo) VALUES ($1, $2, $3)`, [dto.valorHora, usuario, dto.motivo?.trim() || null]);
    return this.tarifa();
  }

  // --- Zonas del parqueadero de un evento ---------------------------------------

  async zonas(eventoId: string) {
    const prefijos = new Map<string, string>((await this.datos.query(`SELECT id, prefijo FROM zonas_parqueadero WHERE evento_id = $1`, [eventoId]))
      .map((z: { id: string; prefijo: string }) => [z.id, z.prefijo]));
    return (await this.ocupacion.estadoZonas(this.datos.manager, eventoId)).map(({ id, nombre, capacidad, orden, ocupados, reservados, disponibles }) =>
      ({ id, nombre, prefijo: prefijos.get(id), capacidad, orden, ocupados, reservados, disponibles }));
  }

  /** La zona nace con sus espacios numerados (CU-023): `N-01` … `N-<capacidad>`. */
  async crearZona(eventoId: string, dto: GuardarZonaDto, usuario: string) {
    const { evento } = await this.eventos.detalle(eventoId);
    if (evento.estado === 'CANCELADO') throw new ConflictException({ codigo: 'EVENTO_CANCELADO', mensaje: 'El evento está cancelado.' });
    const id = await this.datos.transaction(async (m) => {
      const [zona] = await this.conNombreUnico(() => m.query(
        `INSERT INTO zonas_parqueadero (evento_id, nombre, capacidad, orden, prefijo, creada_por) VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, prefijo`, [eventoId, dto.nombre.trim(), dto.capacidad, dto.orden ?? 0, (dto.prefijo ?? prefijoDe(dto.nombre)).toUpperCase(), usuario]));
      await this.asignacion.crearEspacios(m, zona, 1, dto.capacidad);
      return zona.id as string;
    });
    return (await this.zonas(eventoId)).find((z) => z.id === id);
  }

  /** La capacidad cambia agregando o retirando espacios libres; nunca baja de lo ocupado o reservado. */
  async actualizarZona(eventoId: string, zonaId: string, dto: ActualizarZonaDto) {
    await this.datos.transaction(async (m) => {
      const zona = await this.asignacion.bloquearZona(m, eventoId, zonaId);
      if (dto.capacidad !== undefined) {
        const [{ comprometidos }] = await m.query(
          `SELECT (SELECT count(*) FROM estancias WHERE zona_id = $1 AND salida_en IS NULL)
                + (SELECT count(*) FROM reservas WHERE zona_id = $1 AND estado IN ('PENDIENTE_PAGO', 'PAGANDO', 'CONFIRMADA')) AS comprometidos`, [zonaId]);
        if (dto.capacidad < Number(comprometidos)) {
          throw new ConflictException({
            codigo: 'CAPACIDAD_MENOR_A_OCUPACION',
            mensaje: `La zona tiene ${comprometidos} espacios con vehículo o reserva: la capacidad no puede ser menor.`,
          });
        }
        await this.asignacion.ajustarCapacidad(m, zona, dto.capacidad);
      }
      await this.conNombreUnico(() => m.query(`UPDATE zonas_parqueadero SET nombre = $2, capacidad = $3, orden = $4 WHERE id = $1`,
        [zonaId, dto.nombre?.trim() ?? zona.nombre, dto.capacidad ?? zona.capacidad, dto.orden ?? zona.orden]));
    });
    return (await this.zonas(eventoId)).find((z) => z.id === zonaId);
  }

  async eliminarZona(eventoId: string, zonaId: string) {
    await this.datos.transaction(async (m) => {
      await this.asignacion.bloquearZona(m, eventoId, zonaId);
      const [{ usadas }] = await m.query(
        `SELECT (SELECT count(*) FROM estancias WHERE zona_id = $1) + (SELECT count(*) FROM reservas WHERE zona_id = $1)
              + (SELECT count(*) FROM redirecciones WHERE zona_origen_id = $1 OR zona_destino_id = $1) AS usadas`, [zonaId]);
      if (Number(usadas) > 0) {
        throw new ConflictException({ codigo: 'ZONA_CON_HISTORIAL', mensaje: 'La zona ya tuvo vehículos, reservas o redirecciones: no se puede borrar.' });
      }
      await m.query(`DELETE FROM zonas_parqueadero WHERE id = $1`, [zonaId]);
    });
    return { eliminada: zonaId };
  }

  // --- CU-024: el cobro al salir --------------------------------------------------

  /**
   * Pasos 3-5, con la salida ya registrada. CU-024A: prepagada, no se calcula
   * nada. Si no, horas de permanencia redondeadas hacia arriba (mínimo una)
   * por la tarifa vigente al salir. Sin tarifa, el cobro queda pendiente.
   */
  async liquidar(m: EntityManager, estancia: { id: string; prepagada: boolean; ingresoEn: Date }, salida: Date) {
    if (estancia.prepagada) return;
    const tarifa = await this.tarifaVigente(m, salida);
    if (!tarifa) return;
    const horas = horasEntre(new Date(estancia.ingresoEn), new Date(salida));
    await m.query(`UPDATE estancias SET tarifa_id = $2, valor_hora = $3, horas_cobradas = $4, monto = $5 WHERE id = $1`,
      [estancia.id, tarifa.id, tarifa.valorHora, horas, horas * tarifa.valorHora]);
  }

  // --- Apoyo --------------------------------------------------------------------

  private async conNombreUnico<T>(operacion: () => Promise<T>): Promise<T> {
    try {
      return await operacion();
    } catch (error) {
      if (error instanceof QueryFailedError && (error as QueryFailedError & { driverError?: { code?: string } }).driverError?.code === '23505') {
        throw new ConflictException({ codigo: 'ZONA_DUPLICADA', mensaje: 'Ya hay una zona con ese nombre en el evento.' });
      }
      throw error;
    }
  }
}

/** Pasos 4-6: lo que ve el personal al registrar la salida. */
export function cobroDe(e: Pick<Estancia, 'prepagada' | 'horasCobradas' | 'valorHora' | 'monto'>): Cobro {
  if (e.prepagada) return { prepagada: true, pendiente: false, horas: null, valorHora: null, monto: null, mensaje: 'El servicio ya está pagado.' };
  if (e.monto === null) {
    return { prepagada: false, pendiente: true, horas: null, valorHora: null, monto: null, mensaje: 'Sin tarifa vigente: la salida quedó registrada y el cobro pendiente.' };
  }
  return {
    prepagada: false, pendiente: false, horas: e.horasCobradas, valorHora: e.valorHora, monto: e.monto,
    mensaje: `Cobrar ${pesos(e.monto)} (${e.horasCobradas} h × ${pesos(e.valorHora!)}).`,
  };
}
