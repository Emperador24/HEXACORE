import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager, QueryFailedError } from 'typeorm';
import { EventosService } from '../../eventos-recintos/eventos/eventos.service';
import { ActualizarZonaDto, DefinirTarifaDto, GuardarZonaDto, RegistrarIngresoDto } from '../dto/parqueaderos.dto';
import { OcupacionService } from '../ocupacion/ocupacion.service';
import { CONEXION_PARQUEADEROS } from '../persistencia/conexion';

/** Una salida repetida dentro de este margen devuelve la misma salida (reintento del dispositivo). */
const MARGEN_SALIDA_REPETIDA_MIN = 10;
const HORA_MS = 3_600_000;

export interface Estancia {
  id: string; eventoId: string; zonaId: string; zona: string; placa: string; espacio: string | null;
  reservaId: string | null; prepagada: boolean; ingresoEn: Date; salidaEn: Date | null;
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

const COLUMNAS_ESTANCIA = `e.id, e.evento_id AS "eventoId", e.zona_id AS "zonaId", z.nombre AS zona, e.placa, e.espacio,
  e.reserva_id AS "reservaId", e.prepagada, e.ingreso_en AS "ingresoEn", e.salida_en AS "salidaEn",
  e.valor_hora::float AS "valorHora", e.horas_cobradas AS "horasCobradas", e.monto::float AS monto`;

const pesos = (valor: number) => `$${Math.round(valor).toLocaleString('es-CO')}`;
const normalizarPlaca = (placa: string) => placa.replace(/-/g, '').toUpperCase();

/**
 * CU-024: Cobro. También lo que necesita para existir: las zonas del
 * parqueadero de cada evento, la tarifa centralizada y el registro de
 * ingreso y salida.
 *
 * El ingreso y la salida en sí son de CU-022 (otro responsable). Aquí está la
 * versión mínima que deja la hora de ingreso, la zona y si la reserva venía
 * prepagada; cuando CU-021/022/023 existan, llaman a estas mismas operaciones
 * con lo que hayan leído del QR.
 */
@Injectable()
export class CobroService {
  constructor(
    @InjectDataSource(CONEXION_PARQUEADEROS) private readonly datos: DataSource,
    private readonly eventos: EventosService,
    private readonly ocupacion: OcupacionService,
  ) {}

  // --- Tarifa (la define el Administrador) -------------------------------------

  async tarifa() {
    const historial = await this.datos.query(
      `SELECT id, valor_hora::float AS "valorHora", vigente_desde AS "vigenteDesde", definida_por AS "definidaPor", motivo
         FROM tarifas ORDER BY vigente_desde DESC LIMIT 20`);
    return { vigente: historial.find((t: { vigenteDesde: Date }) => t.vigenteDesde <= new Date()) ?? null, historial };
  }

  async definirTarifa(dto: DefinirTarifaDto, usuario: string) {
    await this.datos.query(`INSERT INTO tarifas (valor_hora, definida_por, motivo) VALUES ($1, $2, $3)`, [dto.valorHora, usuario, dto.motivo?.trim() || null]);
    return this.tarifa();
  }

  // --- Zonas del parqueadero de un evento ---------------------------------------

  async zonas(eventoId: string) {
    return (await this.ocupacion.estadoZonas(this.datos.manager, eventoId)).map(({ id, nombre, capacidad, orden, ocupados, disponibles }) =>
      ({ id, nombre, capacidad, orden, ocupados, disponibles }));
  }

  async crearZona(eventoId: string, dto: GuardarZonaDto, usuario: string) {
    const { evento } = await this.eventos.detalle(eventoId);
    if (evento.estado === 'CANCELADO') throw new ConflictException({ codigo: 'EVENTO_CANCELADO', mensaje: 'El evento está cancelado.' });
    const [zona] = await this.conNombreUnico(() => this.datos.query(
      `INSERT INTO zonas_parqueadero (evento_id, nombre, capacidad, orden, creada_por) VALUES ($1, $2, $3, $4, $5)
       RETURNING id, nombre, capacidad, orden`, [eventoId, dto.nombre.trim(), dto.capacidad, dto.orden ?? 0, usuario]));
    return { ...zona, ocupados: 0, disponibles: zona.capacidad };
  }

  async actualizarZona(eventoId: string, zonaId: string, dto: ActualizarZonaDto) {
    await this.datos.transaction(async (m) => {
      const zona = await this.bloquearZona(m, eventoId, zonaId);
      if (dto.capacidad !== undefined) {
        const [{ ocupados }] = await m.query(`SELECT count(*)::int AS ocupados FROM estancias WHERE zona_id = $1 AND salida_en IS NULL`, [zonaId]);
        if (dto.capacidad < ocupados) {
          throw new ConflictException({ codigo: 'CAPACIDAD_MENOR_A_OCUPACION', mensaje: `La zona tiene ${ocupados} vehículos: la capacidad no puede ser menor.` });
        }
      }
      await this.conNombreUnico(() => m.query(`UPDATE zonas_parqueadero SET nombre = $2, capacidad = $3, orden = $4 WHERE id = $1`,
        [zonaId, dto.nombre?.trim() ?? zona.nombre, dto.capacidad ?? zona.capacidad, dto.orden ?? zona.orden]));
    });
    return (await this.zonas(eventoId)).find((z) => z.id === zonaId);
  }

  async eliminarZona(eventoId: string, zonaId: string) {
    await this.datos.transaction(async (m) => {
      await this.bloquearZona(m, eventoId, zonaId);
      const [{ usadas }] = await m.query(
        `SELECT (SELECT count(*) FROM estancias WHERE zona_id = $1) + (SELECT count(*) FROM redirecciones WHERE zona_origen_id = $1 OR zona_destino_id = $1) AS usadas`, [zonaId]);
      if (Number(usadas) > 0) throw new ConflictException({ codigo: 'ZONA_CON_HISTORIAL', mensaje: 'La zona ya tuvo vehículos o redirecciones: no se puede borrar.' });
      await m.query(`DELETE FROM zonas_parqueadero WHERE id = $1`, [zonaId]);
    });
    return { eliminada: zonaId };
  }

  // --- Ingreso (mínimo de CU-022) y CU-025A ------------------------------------

  /**
   * Deja el vehículo en una zona. Sin zona indicada va a la recomendada
   * (CU-025, paso 7). CU-025A: una zona llena no admite más; la zona se
   * bloquea con `FOR UPDATE`, así que dos ingresos simultáneos no pueden
   * ocupar el último espacio a la vez.
   */
  async registrarIngreso(eventoId: string, dto: RegistrarIngresoDto, usuario: string) {
    const { evento } = await this.eventos.detalle(eventoId);
    if (evento.estado !== 'PUBLICADO') throw new ConflictException({ codigo: 'EVENTO_NO_PUBLICADO', mensaje: 'El evento no está publicado.' });
    if (evento.fechaFin <= new Date()) throw new ConflictException({ codigo: 'EVENTO_TERMINADO', mensaje: 'El evento ya terminó.' });
    const placa = normalizarPlaca(dto.placa);

    const id = await this.datos.transaction(async (m) => {
      const recomendacion = await this.ocupacion.recomendacion(m, eventoId);
      const zonaId = dto.zonaId ?? recomendacion.zona?.id;
      if (!zonaId) {
        throw new ConflictException({ codigo: 'PARQUEADERO_LLENO', mensaje: 'No queda espacio en ninguna zona del parqueadero.' });
      }
      const zona = await this.bloquearZona(m, eventoId, zonaId);
      const [{ ocupados }] = await m.query(`SELECT count(*)::int AS ocupados FROM estancias WHERE zona_id = $1 AND salida_en IS NULL`, [zonaId]);
      if (ocupados >= zona.capacidad) {
        throw new ConflictException({
          codigo: 'ZONA_LLENA',
          mensaje: `«${zona.nombre}» está llena (${ocupados}/${zona.capacidad}).`,
          alternativa: recomendacion.zona && recomendacion.zona.id !== zonaId ? recomendacion.zona : null,
        });
      }
      try {
        const [{ id }] = await m.query(
          `INSERT INTO estancias (evento_id, zona_id, placa, espacio, reserva_id, prepagada, ingreso_por) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
          [eventoId, zonaId, placa, dto.espacio?.trim() || null, dto.reservaId ?? null, dto.prepagada ?? false, usuario]);
        return id as string;
      } catch (error) {
        if (error instanceof QueryFailedError && (error as QueryFailedError & { driverError?: { code?: string } }).driverError?.code === '23505') {
          throw new ConflictException({ codigo: 'VEHICULO_EN_LOTE', mensaje: `El vehículo ${placa} ya está dentro del parqueadero.` });
        }
        throw error;
      }
    });
    const estancia = await this.estancia(this.datos.manager, id);
    const recomendada = (await this.ocupacion.recomendacion(this.datos.manager, eventoId)).zona;
    return { estancia, recomendada };
  }

  // --- CU-024: salida y cobro ---------------------------------------------------

  /**
   * Pasos 1-6. La salida se registra **siempre**: si no hay tarifa vigente, el
   * cobro queda pendiente en vez de impedir que el vehículo salga (RNF de
   * disponibilidad). Un reintento poco después devuelve la misma salida.
   */
  async registrarSalida(eventoId: string, placaLeida: string, usuario: string) {
    const placa = normalizarPlaca(placaLeida);
    const resultado = await this.datos.transaction(async (m) => {
      const [abierta] = await m.query(`SELECT id, prepagada, ingreso_en AS "ingresoEn" FROM estancias WHERE evento_id = $1 AND placa = $2 AND salida_en IS NULL FOR UPDATE`, [eventoId, placa]);
      if (!abierta) {
        const [reciente] = await m.query(
          `SELECT id FROM estancias WHERE evento_id = $1 AND placa = $2 AND salida_en > now() - make_interval(mins => $3) ORDER BY salida_en DESC LIMIT 1`,
          [eventoId, placa, MARGEN_SALIDA_REPETIDA_MIN]);
        if (reciente) return { id: reciente.id as string, repetida: true };
        throw new NotFoundException({ codigo: 'VEHICULO_NO_EN_LOTE', mensaje: `El vehículo ${placa} no figura dentro del parqueadero de este evento.` });
      }

      // Paso 2.
      // En Postgres, TypeORM devuelve [filas, cantidad] para un UPDATE.
      const [[{ salida }]] = await m.query(`UPDATE estancias SET salida_en = now(), salida_por = $2 WHERE id = $1 RETURNING salida_en AS salida`, [abierta.id, usuario]);
      // Paso 3-4 y CU-024A: prepagada, no se calcula nada.
      if (abierta.prepagada) return { id: abierta.id as string, repetida: false };

      // Paso 5: horas de permanencia redondeadas hacia arriba (mínimo una) por la tarifa vigente al salir.
      const [tarifa] = await m.query(`SELECT id, valor_hora::float AS "valorHora" FROM tarifas WHERE vigente_desde <= $1 ORDER BY vigente_desde DESC LIMIT 1`, [salida]);
      if (tarifa) {
        const horas = Math.max(1, Math.ceil((new Date(salida).getTime() - new Date(abierta.ingresoEn).getTime()) / HORA_MS));
        await m.query(`UPDATE estancias SET tarifa_id = $2, valor_hora = $3, horas_cobradas = $4, monto = $5 WHERE id = $1`,
          [abierta.id, tarifa.id, tarifa.valorHora, horas, horas * tarifa.valorHora]);
      }
      return { id: abierta.id as string, repetida: false };
    });

    const estancia = await this.estancia(this.datos.manager, resultado.id);
    return { estancia, cobro: cobroDe(estancia), repetida: resultado.repetida };
  }

  async vehiculos(eventoId: string, soloEnLote: boolean) {
    return this.datos.query(
      `SELECT ${COLUMNAS_ESTANCIA} FROM estancias e JOIN zonas_parqueadero z ON z.id = e.zona_id
        WHERE e.evento_id = $1 ${soloEnLote ? 'AND e.salida_en IS NULL' : ''} ORDER BY e.ingreso_en DESC LIMIT 500`, [eventoId]);
  }

  // --- Apoyo --------------------------------------------------------------------

  private async estancia(m: EntityManager, id: string): Promise<Estancia> {
    const [fila] = await m.query(`SELECT ${COLUMNAS_ESTANCIA} FROM estancias e JOIN zonas_parqueadero z ON z.id = e.zona_id WHERE e.id = $1`, [id]);
    return fila;
  }

  private async bloquearZona(m: EntityManager, eventoId: string, zonaId: string) {
    const [zona] = await m.query(`SELECT id, nombre, capacidad, orden FROM zonas_parqueadero WHERE id = $1 AND evento_id = $2 FOR UPDATE`, [zonaId, eventoId]);
    if (!zona) throw new NotFoundException({ codigo: 'ZONA_NO_ENCONTRADA', mensaje: 'La zona no es de este evento.' });
    return zona as { id: string; nombre: string; capacidad: number; orden: number };
  }

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
