import { randomUUID } from 'node:crypto';
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { PagosService, ResultadoCobro } from '../pagos';
import { CONEXION_CONCILIACION } from './persistencia/conexion';
import { AprobarReembolsoDto, ModuloConciliable, SolicitarConciliacionDto } from './dto/conciliacion.dto';

export type EstadoConciliacion = 'EN_PROCESO' | 'LISTA' | 'CONCILIADA_AUTOMATICA' | 'CERRADA';
export type EstadoItem = 'CONCILIADO' | 'DIFERENCIA' | 'HUERFANA';

export interface FilaConciliacion {
  id: string; desde: Date; hasta: Date; modulo: ModuloConciliable | null; estado: EstadoConciliacion;
  total: number; coincidentes: number; conDiferencia: number; huerfanas: number;
  solicitadaPor: string; solicitadaEn: Date; despachadaEn: Date | null; procesadaEn: Date | null;
  cerradaPor: string | null; cerradaEn: Date | null;
}

export interface FilaItem {
  id: string; conciliacionId: string; claveIdempotencia: string | null; referenciaPasarela: string | null;
  tipo: 'COBRO' | 'REEMBOLSO'; estadoItem: EstadoItem; montoSistema: number | null; montoPasarela: number | null;
  moneda: string | null; detalle: string | null; creadoEn: Date;
}

const COLUMNAS_CONCILIACION = `id, desde, hasta, modulo, estado, total, coincidentes, con_diferencia AS "conDiferencia",
  huerfanas, solicitada_por AS "solicitadaPor", solicitada_en AS "solicitadaEn", despachada_en AS "despachadaEn",
  procesada_en AS "procesadaEn", cerrada_por AS "cerradaPor", cerrada_en AS "cerradaEn"`;

const COLUMNAS_ITEM = `id, conciliacion_id AS "conciliacionId", clave_idempotencia AS "claveIdempotencia",
  referencia_pasarela AS "referenciaPasarela", tipo, estado_item AS "estadoItem", monto_sistema AS "montoSistema",
  monto_pasarela AS "montoPasarela", moneda, detalle, creado_en AS "creadoEn"`;

/**
 * CU-031: Gestión de Pagos y Conciliación Financiera.
 *
 * `solicitar` solo escribe la fila (pasos 1-2); un despachador la publica en
 * la cola y `procesar` —que corre del otro lado, en el consumidor— hace la
 * comparación de verdad contra la pasarela (pasos 3-5). El reembolso manual
 * (pasos 6-9) reutiliza `PagosService.reembolsar`: esta clase no vuelve a
 * hablar con la pasarela por su cuenta para devolver dinero.
 */
@Injectable()
export class ConciliacionService {
  constructor(
    @InjectDataSource(CONEXION_CONCILIACION) private readonly datos: DataSource,
    private readonly pagos: PagosService,
  ) {}

  // --- Pasos 1-2: solicitar -------------------------------------------------------

  async solicitar(dto: SolicitarConciliacionDto, actor: string): Promise<FilaConciliacion> {
    const desde = new Date(dto.desde);
    const hasta = new Date(dto.hasta);
    if (hasta <= desde) throw new BadRequestException({ codigo: 'RANGO_INVALIDO', mensaje: '«hasta» debe ser posterior a «desde».' });

    const [{ id }] = await this.datos.query(
      `INSERT INTO conciliaciones (desde, hasta, modulo, solicitada_por) VALUES ($1,$2,$3,$4) RETURNING id`,
      [desde, hasta, dto.modulo ?? null, actor],
    );
    await this.anotar(id, 'SOLICITADA', actor, { desde: dto.desde, hasta: dto.hasta, modulo: dto.modulo ?? null });
    return this.buscar(id);
  }

  listar(): Promise<FilaConciliacion[]> {
    return this.datos.query(`SELECT ${COLUMNAS_CONCILIACION} FROM conciliaciones ORDER BY solicitada_en DESC LIMIT 200`);
  }

  async detalle(id: string) {
    const conciliacion = await this.buscar(id);
    const [items, reembolsos, bitacora] = await Promise.all([
      this.datos.query(`SELECT ${COLUMNAS_ITEM} FROM conciliacion_items WHERE conciliacion_id = $1 ORDER BY estado_item, creado_en`, [id]),
      this.datos.query(
        `SELECT r.id, r.conciliacion_item_id AS "itemId", r.monto, r.moneda, r.justificacion, r.aprobado_por AS "aprobadoPor",
                r.aprobado_en AS "aprobadoEn", r.resultado, r.referencia_pasarela AS "referenciaPasarela", r.notificado_en AS "notificadoEn"
           FROM reembolsos_administrativos r JOIN conciliacion_items i ON i.id = r.conciliacion_item_id WHERE i.conciliacion_id = $1`,
        [id],
      ),
      this.datos.query(`SELECT id, tipo, detalle, realizado_por AS "realizadoPor", fecha FROM bitacora_conciliacion WHERE conciliacion_id = $1 ORDER BY fecha DESC LIMIT 200`, [id]),
    ]);
    return { conciliacion, items, reembolsos, bitacora };
  }

  // --- Paso 3-5: comparación (consumidor de la cola) -------------------------------

  /** Idempotente: una conciliación que ya se procesó no se vuelve a comparar. */
  async procesar(conciliacionId: string): Promise<void> {
    const conciliacion = await this.buscar(conciliacionId);
    if (conciliacion.estado !== 'EN_PROCESO') return;

    const [sistema, pasarela] = await Promise.all([
      this.pagos.transaccionesEnRango(conciliacion.desde, conciliacion.hasta, conciliacion.modulo ?? undefined),
      this.pagos.transaccionesDeLaPasarela(conciliacion.desde, conciliacion.hasta),
    ]);

    const porReferencia = new Map(pasarela.map((p) => [p.referencia, p]));
    const usadas = new Set<string>();
    const items: Omit<FilaItem, 'id' | 'conciliacionId' | 'creadoEn'>[] = [];

    for (const t of sistema) {
      if (!t.referencia) continue; // Nada que comparar: nunca llegó a la pasarela (RECHAZADO/INDETERMINADO sin referencia).
      const externa = porReferencia.get(t.referencia);
      if (!externa) {
        items.push({
          claveIdempotencia: t.claveIdempotencia, referenciaPasarela: t.referencia, tipo: t.tipo as 'COBRO' | 'REEMBOLSO',
          estadoItem: 'DIFERENCIA', montoSistema: Number(t.monto), montoPasarela: null, moneda: t.moneda,
          detalle: 'El sistema tiene esta transacción, pero la pasarela no la reporta en el rango consultado.',
        });
        continue;
      }
      usadas.add(t.referencia);
      const mismoMonto = Math.abs(Number(t.monto) - externa.monto) < 0.01;
      const mismaMoneda = t.moneda === externa.moneda;
      const mismoResultado = t.resultado === externa.estado;
      const coincide = mismoMonto && mismaMoneda && mismoResultado;
      items.push({
        claveIdempotencia: t.claveIdempotencia, referenciaPasarela: t.referencia, tipo: t.tipo as 'COBRO' | 'REEMBOLSO',
        estadoItem: coincide ? 'CONCILIADO' : 'DIFERENCIA', montoSistema: Number(t.monto), montoPasarela: externa.monto, moneda: t.moneda,
        detalle: coincide ? null : this.describirDiferencia({ mismoMonto, mismaMoneda, mismoResultado }, t.resultado, externa.estado),
      });
    }

    // CU-031B: lo que la pasarela reporta y el sistema no tiene registrado.
    for (const externa of pasarela) {
      if (usadas.has(externa.referencia)) continue;
      items.push({
        claveIdempotencia: null, referenciaPasarela: externa.referencia, tipo: externa.tipo, estadoItem: 'HUERFANA',
        montoSistema: null, montoPasarela: externa.monto, moneda: externa.moneda,
        detalle: 'La pasarela reporta esta transacción, pero no existe en el libro del sistema.',
      });
    }

    const coincidentes = items.filter((i) => i.estadoItem === 'CONCILIADO').length;
    const conDiferencia = items.filter((i) => i.estadoItem === 'DIFERENCIA').length;
    const huerfanas = items.filter((i) => i.estadoItem === 'HUERFANA').length;
    // CU-031A: todo concilió sin diferencias, se marca conciliado automáticamente.
    const autoConciliada = conDiferencia === 0 && huerfanas === 0;

    await this.datos.transaction(async (m) => {
      for (const item of items) {
        await m.query(
          `INSERT INTO conciliacion_items (conciliacion_id, clave_idempotencia, referencia_pasarela, tipo, estado_item, monto_sistema, monto_pasarela, moneda, detalle)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [conciliacionId, item.claveIdempotencia, item.referenciaPasarela, item.tipo, item.estadoItem, item.montoSistema, item.montoPasarela, item.moneda, item.detalle],
        );
      }
      await m.query(
        `UPDATE conciliaciones SET estado = $2, total = $3, coincidentes = $4, con_diferencia = $5, huerfanas = $6, procesada_en = now(),
                                    cerrada_en = CASE WHEN $7 THEN now() ELSE cerrada_en END
         WHERE id = $1`,
        [conciliacionId, autoConciliada ? 'CONCILIADA_AUTOMATICA' : 'LISTA', items.length, coincidentes, conDiferencia, huerfanas, autoConciliada],
      );
      await this.anotar(conciliacionId, 'PROCESADA', null, { total: items.length, coincidentes, conDiferencia, huerfanas, autoConciliada }, m);
    });
  }

  private describirDiferencia(cual: { mismoMonto: boolean; mismaMoneda: boolean; mismoResultado: boolean }, sistema: string, pasarela: string): string {
    const partes: string[] = [];
    if (!cual.mismoMonto) partes.push('el monto no coincide');
    if (!cual.mismaMoneda) partes.push('la moneda no coincide');
    if (!cual.mismoResultado) partes.push(`el sistema registra ${sistema} y la pasarela ${pasarela}`);
    return partes.join('; ');
  }

  // --- Pasos 6-9: reembolso administrativo manual -----------------------------------

  async aprobarReembolso(conciliacionId: string, dto: AprobarReembolsoDto, actor: string) {
    const item = await this.item(conciliacionId, dto.itemId);
    if (item.estadoItem !== 'DIFERENCIA') {
      throw new ConflictException({ codigo: 'ITEM_SIN_DIFERENCIA', mensaje: 'Solo se aprueba un reembolso manual para un ítem con diferencia.' });
    }
    if (!item.referenciaPasarela || !item.moneda) {
      throw new BadRequestException({ codigo: 'ITEM_SIN_REFERENCIA', mensaje: 'Este ítem no tiene una referencia de la pasarela a la cual reembolsar.' });
    }

    const claveIdempotencia = `conciliacion-${randomUUID()}`;
    // Paso 8: reutiliza la lógica existente de reembolsos (CU-003); no se
    // vuelve a hablar con la pasarela por fuera del libro de Pagos.
    const respuesta = await this.pagos.reembolsar({
      claveIdempotencia, solicitante: 'conciliacion', referenciaCobro: item.referenciaPasarela,
      monto: dto.monto, moneda: item.moneda, motivo: dto.justificacion,
    });

    await this.datos.transaction(async (m) => {
      await m.query(
        `INSERT INTO reembolsos_administrativos (conciliacion_item_id, clave_idempotencia, clave_transaccion_original, monto, moneda, justificacion, aprobado_por, resultado, referencia_pasarela)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [item.id, claveIdempotencia, item.claveIdempotencia, dto.monto, item.moneda, dto.justificacion.trim(), actor, respuesta.resultado, respuesta.referencia],
      );
      // Postcondición 1: la transacción conciliada queda marcada y no se vuelve a procesar.
      if (respuesta.resultado === ResultadoCobro.APROBADO) {
        await m.query(`UPDATE conciliacion_items SET estado_item = 'CONCILIADO', detalle = $2 WHERE id = $1`,
          [item.id, `Diferencia resuelta con reembolso administrativo (${dto.justificacion.trim()}).`]);
        // Postcondición 2: notifica al cliente sobre el reembolso.
        await m.query(`UPDATE reembolsos_administrativos SET notificado_en = now() WHERE clave_idempotencia = $1`, [claveIdempotencia]);
        await this.anotar(conciliacionId, 'CLIENTE_NOTIFICADO', actor, { itemId: item.id, monto: dto.monto }, m);
      }
      await this.anotar(conciliacionId, 'REEMBOLSO_APROBADO', actor, { itemId: item.id, monto: dto.monto, justificacion: dto.justificacion.trim(), resultado: respuesta.resultado }, m);
    });
    return this.detalle(conciliacionId);
  }

  // --- Cierre manual tras revisar (paso "decide si requieren reembolso") ------------

  async cerrar(conciliacionId: string, actor: string): Promise<FilaConciliacion> {
    const conciliacion = await this.buscar(conciliacionId);
    if (conciliacion.estado === 'EN_PROCESO') {
      throw new ConflictException({ codigo: 'CONCILIACION_SIN_PROCESAR', mensaje: 'Esta conciliación todavía no terminó de compararse contra la pasarela.' });
    }
    if (conciliacion.estado === 'CERRADA' || conciliacion.estado === 'CONCILIADA_AUTOMATICA') return conciliacion;
    await this.datos.query(`UPDATE conciliaciones SET estado = 'CERRADA', cerrada_por = $2, cerrada_en = now() WHERE id = $1`, [conciliacionId, actor]);
    await this.anotar(conciliacionId, 'CERRADA', actor, {});
    return this.buscar(conciliacionId);
  }

  // --- Apoyo -------------------------------------------------------------------------

  private async item(conciliacionId: string, itemId: string): Promise<FilaItem> {
    const [fila] = await this.datos.query(`SELECT ${COLUMNAS_ITEM} FROM conciliacion_items WHERE id = $1 AND conciliacion_id = $2`, [itemId, conciliacionId]);
    if (!fila) throw new NotFoundException({ codigo: 'ITEM_NO_ENCONTRADO', mensaje: 'Ese ítem no es de esta conciliación.' });
    return fila;
  }

  private async buscar(id: string): Promise<FilaConciliacion> {
    const [fila] = await this.datos.query(`SELECT ${COLUMNAS_CONCILIACION} FROM conciliaciones WHERE id = $1`, [id]);
    if (!fila) throw new NotFoundException({ codigo: 'CONCILIACION_NO_ENCONTRADA', mensaje: 'La conciliación no existe.' });
    return fila;
  }

  private anotar(conciliacionId: string, tipo: string, usuario: string | null, detalle: Record<string, unknown>, m: EntityManager | DataSource = this.datos) {
    return m.query(`INSERT INTO bitacora_conciliacion (conciliacion_id, tipo, detalle, realizado_por) VALUES ($1, $2, $3, $4)`, [conciliacionId, tipo, JSON.stringify(detalle), usuario]);
  }
}
