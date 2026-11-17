import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { EventosService } from '../../eventos-recintos/eventos/eventos.service';
import { CONEXION_LOGISTICA } from '../persistencia/conexion';
import {
  AsignarPersonalDto,
  AsignarProveedorDto,
  AsignarRecursoDto,
  AprobarPlanDto,
  CrearPlanDto,
  RegistrarRecursoDto,
  SolicitarPersonalAdicionalDto,
  TipoRecurso,
} from './dto/planificacion.dto';

export interface FilaPlan {
  id: string; eventoId: string; estado: 'BORRADOR' | 'APROBADO'; presupuesto: number | null; costoEstimado: number;
  fechaEventoCronograma: Date | null; creadoPor: string; creadoEn: Date; actualizadoEn: Date; aprobadoPor: string | null; aprobadoEn: Date | null;
}

interface Ventana { inicio: Date; fin: Date; nombre: string }

export interface Conflicto {
  tipo: 'RECURSO_INSUFICIENTE' | 'PROVEEDOR_OCUPADO';
  mensaje: string;
  recursoId?: string;
  proveedorId?: string;
  alternativas?: { id: string; nombre: string }[];
}

const COLUMNAS_PLAN = `id, evento_id AS "eventoId", estado, presupuesto, costo_estimado AS "costoEstimado",
  fecha_evento_cronograma AS "fechaEventoCronograma", creado_por AS "creadoPor", creado_en AS "creadoEn",
  actualizado_en AS "actualizadoEn", aprobado_por AS "aprobadoPor", aprobado_en AS "aprobadoEn"`;

/** Horas de montaje antes del evento y de desmontaje después (paso 9). */
const HORAS_MONTAJE = 3;
const HORAS_DESMONTAJE = 2;
const HORA_MS = 3_600_000;

/**
 * CU-016: Planificar logística del evento.
 *
 * Un plan por evento (precondición 1), que reúne recursos materiales
 * (catálogo propio), proveedores (CU-030) y personal (`empleados`,
 * existente). Mientras está en BORRADOR se puede seguir ajustando; aprobarlo
 * (paso 8) exige resolver los conflictos de horario señalados (paso 6) y
 * confirmar si el costo supera el presupuesto (CU-016E).
 *
 * El cronograma (post-condición 1) se deriva de las fechas vigentes del
 * evento en cada lectura: si el evento cambia de fecha, se regenera solo
 * (CU-016D), sin depender de un consumidor de eventos.
 */
@Injectable()
export class PlanificacionService {
  constructor(
    @InjectDataSource(CONEXION_LOGISTICA) private readonly datos: DataSource,
    private readonly eventos: EventosService,
  ) {}

  // --- Catálogo de recursos (precondición 2) --------------------------------------

  async registrarRecurso(dto: RegistrarRecursoDto, creadoPor: string) {
    const [{ id }] = await this.datos.query(
      `INSERT INTO recursos_logisticos (nombre, tipo, cantidad_total, costo_unitario, creado_por) VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [dto.nombre.trim(), dto.tipo, dto.cantidadTotal, dto.costoUnitario ?? 0, creadoPor],
    );
    return this.recurso(id);
  }

  listarRecursos(tipo?: TipoRecurso) {
    return tipo
      ? this.datos.query(`SELECT id, nombre, tipo, cantidad_total AS "cantidadTotal", costo_unitario AS "costoUnitario" FROM recursos_logisticos WHERE tipo = $1 ORDER BY nombre`, [tipo])
      : this.datos.query(`SELECT id, nombre, tipo, cantidad_total AS "cantidadTotal", costo_unitario AS "costoUnitario" FROM recursos_logisticos ORDER BY nombre`);
  }

  private async recurso(id: string) {
    const [fila] = await this.datos.query(`SELECT id, nombre, tipo, cantidad_total AS "cantidadTotal", costo_unitario AS "costoUnitario" FROM recursos_logisticos WHERE id = $1`, [id]);
    if (!fila) throw new NotFoundException({ codigo: 'RECURSO_NO_ENCONTRADO', mensaje: 'El recurso no existe.' });
    return fila;
  }

  // --- Paso 1: obtener o iniciar el plan de un evento -----------------------------

  async obtenerOCrear(eventoId: string, dto: CrearPlanDto, creadoPor: string): Promise<FilaPlan> {
    // Precondición 1: el evento existe.
    await this.eventos.detalle(eventoId);
    const existente = await this.planDeEvento(eventoId);
    if (existente) return existente;
    const [{ id }] = await this.datos.query(
      `INSERT INTO planes_logisticos (evento_id, presupuesto, creado_por) VALUES ($1,$2,$3) RETURNING id`,
      [eventoId, dto.presupuesto ?? null, creadoPor],
    );
    await this.anotar(id, 'CREADO', creadoPor, { eventoId, presupuesto: dto.presupuesto ?? null });
    return this.buscar(id);
  }

  private async planDeEvento(eventoId: string): Promise<FilaPlan | null> {
    const [fila] = await this.datos.query(`SELECT ${COLUMNAS_PLAN} FROM planes_logisticos WHERE evento_id = $1`, [eventoId]);
    return fila ?? null;
  }

  // --- Paso 2-4: detalle, con conflictos (paso 5) y cronograma (CU-016D) ---------

  async detalle(planId: string) {
    const plan = await this.buscar(planId);
    const ventana = await this.ventanaDePlan(plan);
    await this.regenerarCronogramaSiCambioFecha(plan, ventana);
    const actual = await this.buscar(planId);

    const [recursos, proveedores, personal, cronograma, bitacora, solicitudes, conflictos] = await Promise.all([
      this.recursosDePlan(planId),
      this.proveedoresDePlan(planId),
      this.personalDePlan(planId),
      this.datos.query(`SELECT id, titulo, inicio, fin, tipo FROM cronograma_items WHERE plan_id = $1 ORDER BY inicio`, [planId]),
      this.datos.query(`SELECT id, tipo, detalle, realizado_por AS "realizadoPor", fecha FROM bitacora_planificacion WHERE plan_id = $1 ORDER BY fecha DESC LIMIT 100`, [planId]),
      this.datos.query(`SELECT id, rol, cantidad, motivo, estado, creado_en AS "creadoEn" FROM solicitudes_personal_adicional WHERE plan_id = $1 ORDER BY creado_en DESC`, [planId]),
      this.conflictos(actual, ventana),
    ]);

    const costoEstimado = this.calcularCosto(recursos, proveedores);
    if (Number(actual.costoEstimado) !== costoEstimado) {
      await this.datos.query(`UPDATE planes_logisticos SET costo_estimado = $2, actualizado_en = now() WHERE id = $1`, [planId, costoEstimado]);
    }

    return {
      plan: { ...actual, costoEstimado },
      evento: { id: plan.eventoId, nombre: ventana.nombre, fechaInicio: ventana.inicio, fechaFin: ventana.fin },
      recursos, proveedores, personal, cronograma, bitacora, solicitudesPersonalAdicional: solicitudes,
      conflictos,
      // CU-016C: los RECURSO_INSUFICIENTE son la alerta de recursos insuficientes.
      excedePresupuesto: actual.presupuesto !== null && costoEstimado > Number(actual.presupuesto),
    };
  }

  // --- Paso 3: asignar recursos, proveedores y personal ---------------------------

  async asignarRecurso(planId: string, dto: AsignarRecursoDto, actor: string) {
    const plan = await this.exigirBorrador(planId);
    await this.recurso(dto.recursoId);
    await this.datos.query(
      `INSERT INTO plan_recursos (plan_id, recurso_id, cantidad) VALUES ($1,$2,$3)
       ON CONFLICT (plan_id, recurso_id) DO UPDATE SET cantidad = EXCLUDED.cantidad, actualizado_en = now()`,
      [planId, dto.recursoId, dto.cantidad],
    );
    await this.anotar(planId, 'RECURSO_ASIGNADO', actor, { recursoId: dto.recursoId, cantidad: dto.cantidad });
    return this.detalle(plan.id);
  }

  async quitarRecurso(planId: string, recursoId: string, actor: string) {
    const plan = await this.exigirBorrador(planId);
    await this.datos.query(`DELETE FROM plan_recursos WHERE plan_id = $1 AND recurso_id = $2`, [planId, recursoId]);
    await this.anotar(planId, 'RECURSO_RETIRADO', actor, { recursoId });
    return this.detalle(plan.id);
  }

  /** CU-016B: si el proveedor elegido no está activo, se proponen alternativas del mismo tipo de servicio. */
  async asignarProveedor(planId: string, dto: AsignarProveedorDto, actor: string) {
    const plan = await this.exigirBorrador(planId);
    const [proveedor] = await this.datos.query(`SELECT id, estado, tipo_servicio AS "tipoServicio" FROM proveedores WHERE id = $1`, [dto.proveedorId]);
    if (!proveedor) throw new NotFoundException({ codigo: 'PROVEEDOR_NO_ENCONTRADO', mensaje: 'El proveedor no existe.' });
    if (proveedor.estado !== 'ACTIVO') {
      const alternativas = await this.proveedoresAlternativos(proveedor.tipoServicio, dto.proveedorId);
      throw new ConflictException({
        codigo: 'PROVEEDOR_NO_DISPONIBLE',
        mensaje: 'Ese proveedor no está activo.',
        alternativas,
      });
    }
    await this.datos.query(
      `INSERT INTO plan_proveedores (plan_id, proveedor_id, costo) VALUES ($1,$2,$3)
       ON CONFLICT (plan_id, proveedor_id) DO UPDATE SET costo = EXCLUDED.costo, actualizado_en = now()`,
      [planId, dto.proveedorId, dto.costo ?? null],
    );
    await this.anotar(planId, 'PROVEEDOR_ASIGNADO', actor, { proveedorId: dto.proveedorId, costo: dto.costo ?? null });
    return this.detalle(plan.id);
  }

  async quitarProveedor(planId: string, proveedorId: string, actor: string) {
    const plan = await this.exigirBorrador(planId);
    await this.datos.query(`DELETE FROM plan_proveedores WHERE plan_id = $1 AND proveedor_id = $2`, [planId, proveedorId]);
    await this.anotar(planId, 'PROVEEDOR_RETIRADO', actor, { proveedorId });
    return this.detalle(plan.id);
  }

  async asignarPersonal(planId: string, dto: AsignarPersonalDto, actor: string) {
    const plan = await this.exigirBorrador(planId);
    const [empleado] = await this.datos.query(`SELECT id, activo FROM empleados WHERE id = $1`, [dto.empleadoId]);
    if (!empleado) throw new NotFoundException({ codigo: 'EMPLEADO_NO_ENCONTRADO', mensaje: 'El empleado no existe.' });
    if (!empleado.activo) throw new BadRequestException({ codigo: 'EMPLEADO_INACTIVO', mensaje: 'Ese empleado está dado de baja.' });
    await this.datos.query(`INSERT INTO plan_personal (plan_id, empleado_id) VALUES ($1,$2) ON CONFLICT (plan_id, empleado_id) DO NOTHING`, [planId, dto.empleadoId]);
    await this.anotar(planId, 'PERSONAL_ASIGNADO', actor, { empleadoId: dto.empleadoId });
    return this.detalle(plan.id);
  }

  async quitarPersonal(planId: string, empleadoId: string, actor: string) {
    const plan = await this.exigirBorrador(planId);
    await this.datos.query(`DELETE FROM plan_personal WHERE plan_id = $1 AND empleado_id = $2`, [planId, empleadoId]);
    await this.anotar(planId, 'PERSONAL_RETIRADO', actor, { empleadoId });
    return this.detalle(plan.id);
  }

  /** CU-016A: no hay suficiente personal disponible; se deja constancia de lo que se pide. */
  async solicitarPersonalAdicional(planId: string, dto: SolicitarPersonalAdicionalDto, actor: string) {
    const plan = await this.exigirBorrador(planId);
    await this.datos.query(
      `INSERT INTO solicitudes_personal_adicional (plan_id, rol, cantidad, motivo, creado_por) VALUES ($1,$2,$3,$4,$5)`,
      [planId, dto.rol.trim(), dto.cantidad, dto.motivo.trim(), actor],
    );
    await this.anotar(planId, 'PERSONAL_ADICIONAL_SOLICITADO', actor, { rol: dto.rol.trim(), cantidad: dto.cantidad });
    return this.detalle(plan.id);
  }

  // --- Paso 8-10: aprobar -----------------------------------------------------------

  async aprobar(planId: string, dto: AprobarPlanDto, actor: string) {
    const plan = await this.exigirBorrador(planId);
    const ventana = await this.ventanaDePlan(plan);
    await this.regenerarCronogramaSiCambioFecha(plan, ventana);
    const actual = await this.buscar(planId);

    const conflictos = await this.conflictos(actual, ventana);
    if (conflictos.length) {
      throw new ConflictException({ codigo: 'CONFLICTOS_PENDIENTES', mensaje: 'Resuelve los conflictos señalados antes de aprobar.', conflictos });
    }

    const [recursos, proveedores, personal] = await Promise.all([this.recursosDePlan(planId), this.proveedoresDePlan(planId), this.personalDePlan(planId)]);
    const costoEstimado = this.calcularCosto(recursos, proveedores);
    // CU-016E: el costo supera el presupuesto del evento.
    if (actual.presupuesto !== null && costoEstimado > Number(actual.presupuesto) && !dto.confirmarSobrePresupuesto) {
      throw new ConflictException({
        codigo: 'PRESUPUESTO_SUPERADO',
        mensaje: `El costo estimado (${costoEstimado}) supera el presupuesto (${actual.presupuesto}); confirma para aprobar de todas formas.`,
        costoEstimado, presupuesto: actual.presupuesto,
      });
    }

    await this.datos.transaction(async (m) => {
      await m.query(`UPDATE planes_logisticos SET estado = 'APROBADO', costo_estimado = $2, aprobado_por = $3, aprobado_en = now(), actualizado_en = now() WHERE id = $1`,
        [planId, costoEstimado, actor]);
      await this.anotar(planId, 'APROBADO', actor, { costoEstimado, presupuesto: actual.presupuesto }, m);
      // Paso 10: notifica a los proveedores y al personal asignado.
      for (const p of proveedores) await this.anotar(planId, 'NOTIFICADO_PROVEEDOR', actor, { proveedorId: p.proveedorId, nombre: p.nombre }, m);
      for (const emp of personal) await this.anotar(planId, 'NOTIFICADO_PERSONAL', actor, { empleadoId: emp.empleadoId, nombre: emp.nombre }, m);
    });
    return this.detalle(planId);
  }

  // --- Costeo (paso 7) --------------------------------------------------------------

  private calcularCosto(
    recursos: { cantidad: number; costoUnitario: number }[],
    proveedores: { costo: number | null }[],
  ): number {
    const totalRecursos = recursos.reduce((n, r) => n + r.cantidad * Number(r.costoUnitario), 0);
    const totalProveedores = proveedores.reduce((n, p) => n + Number(p.costo ?? 0), 0);
    return Math.round((totalRecursos + totalProveedores) * 100) / 100;
  }

  // --- Conflictos (pasos 4-6) -------------------------------------------------------

  private async conflictos(plan: FilaPlan, ventana: Ventana): Promise<Conflicto[]> {
    const conflictos: Conflicto[] = [];
    for (const r of await this.recursosDePlan(plan.id)) {
      const otrosPlanes: { planId: string; eventoId: string; cantidad: number }[] = await this.datos.query(
        `SELECT pr.plan_id AS "planId", pl.evento_id AS "eventoId", pr.cantidad
           FROM plan_recursos pr JOIN planes_logisticos pl ON pl.id = pr.plan_id
          WHERE pr.recurso_id = $1 AND pr.plan_id != $2`,
        [r.recursoId, plan.id],
      );
      let ocupado = r.cantidad;
      for (const otro of otrosPlanes) {
        const ventanaOtro = await this.ventanaDeEvento(otro.eventoId);
        if (ventanaOtro && this.solapan(ventana, ventanaOtro)) ocupado += otro.cantidad;
      }
      if (ocupado > r.cantidadTotal) {
        conflictos.push({
          tipo: 'RECURSO_INSUFICIENTE', recursoId: r.recursoId,
          mensaje: `«${r.nombre}»: se necesitan ${ocupado} para fechas que se cruzan con otro evento, y solo hay ${r.cantidadTotal} en total.`,
        });
      }
    }
    for (const p of await this.proveedoresDePlan(plan.id)) {
      const otrosPlanes: { planId: string; eventoId: string }[] = await this.datos.query(
        `SELECT pp.plan_id AS "planId", pl.evento_id AS "eventoId"
           FROM plan_proveedores pp JOIN planes_logisticos pl ON pl.id = pp.plan_id
          WHERE pp.proveedor_id = $1 AND pp.plan_id != $2`,
        [p.proveedorId, plan.id],
      );
      for (const otro of otrosPlanes) {
        const ventanaOtro = await this.ventanaDeEvento(otro.eventoId);
        if (ventanaOtro && this.solapan(ventana, ventanaOtro)) {
          conflictos.push({
            tipo: 'PROVEEDOR_OCUPADO', proveedorId: p.proveedorId,
            mensaje: `«${p.nombre}» ya está asignado a «${ventanaOtro.nombre}», en fechas que se cruzan.`,
            alternativas: await this.proveedoresAlternativos(p.tipoServicio, p.proveedorId),
          });
          break;
        }
      }
    }
    return conflictos;
  }

  /** CU-016B: otros proveedores activos del mismo tipo de servicio. */
  private proveedoresAlternativos(tipoServicio: string, excluirProveedorId: string): Promise<{ id: string; nombre: string }[]> {
    return this.datos.query(
      `SELECT id, nombre FROM proveedores WHERE tipo_servicio = $1 AND estado = 'ACTIVO' AND id != $2 ORDER BY nombre LIMIT 10`,
      [tipoServicio, excluirProveedorId],
    );
  }

  private solapan(a: Ventana, b: Ventana): boolean {
    return a.inicio < b.fin && b.inicio < a.fin;
  }

  private async ventanaDePlan(plan: FilaPlan): Promise<Ventana> {
    const { evento } = await this.eventos.detalle(plan.eventoId);
    return { inicio: evento.fechaInicio, fin: evento.fechaFin, nombre: evento.nombre };
  }

  private async ventanaDeEvento(eventoId: string): Promise<Ventana | null> {
    try {
      const { evento } = await this.eventos.detalle(eventoId);
      return { inicio: evento.fechaInicio, fin: evento.fechaFin, nombre: evento.nombre };
    } catch {
      return null;
    }
  }

  // --- Cronograma (post-condición 1, CU-016D) ---------------------------------------

  private async regenerarCronogramaSiCambioFecha(plan: FilaPlan, ventana: Ventana): Promise<void> {
    const vigente = plan.fechaEventoCronograma?.getTime();
    if (vigente === ventana.inicio.getTime()) return;
    await this.datos.transaction(async (m) => {
      await m.query(`DELETE FROM cronograma_items WHERE plan_id = $1`, [plan.id]);
      const montaje = new Date(ventana.inicio.getTime() - HORAS_MONTAJE * HORA_MS);
      const desmontaje = new Date(ventana.fin.getTime() + HORAS_DESMONTAJE * HORA_MS);
      await m.query(
        `INSERT INTO cronograma_items (plan_id, titulo, inicio, fin, tipo) VALUES
         ($1, 'Montaje', $2, $3, 'MONTAJE'), ($1, 'Evento', $3, $4, 'EVENTO'), ($1, 'Desmontaje', $4, $5, 'DESMONTAJE')`,
        [plan.id, montaje, ventana.inicio, ventana.fin, desmontaje],
      );
      await m.query(`UPDATE planes_logisticos SET fecha_evento_cronograma = $2 WHERE id = $1`, [plan.id, ventana.inicio]);
      await this.anotar(plan.id, vigente === undefined ? 'CRONOGRAMA_GENERADO' : 'CRONOGRAMA_ACTUALIZADO', null,
        { fechaAnterior: plan.fechaEventoCronograma, fechaNueva: ventana.inicio }, m);
    });
  }

  // --- Consultas de apoyo ------------------------------------------------------------

  private recursosDePlan(planId: string): Promise<{ recursoId: string; nombre: string; cantidad: number; cantidadTotal: number; costoUnitario: number }[]> {
    return this.datos.query(
      `SELECT r.id AS "recursoId", r.nombre, pr.cantidad, r.cantidad_total AS "cantidadTotal", r.costo_unitario AS "costoUnitario"
         FROM plan_recursos pr JOIN recursos_logisticos r ON r.id = pr.recurso_id WHERE pr.plan_id = $1 ORDER BY r.nombre`,
      [planId],
    );
  }

  private proveedoresDePlan(planId: string): Promise<{ proveedorId: string; nombre: string; tipoServicio: string; costo: number | null }[]> {
    return this.datos.query(
      `SELECT p.id AS "proveedorId", p.nombre, p.tipo_servicio AS "tipoServicio", pp.costo
         FROM plan_proveedores pp JOIN proveedores p ON p.id = pp.proveedor_id WHERE pp.plan_id = $1 ORDER BY p.nombre`,
      [planId],
    );
  }

  private personalDePlan(planId: string): Promise<{ empleadoId: string; nombre: string; rol: string }[]> {
    return this.datos.query(
      `SELECT e.id AS "empleadoId", e.nombre, e.rol FROM plan_personal pp JOIN empleados e ON e.id = pp.empleado_id WHERE pp.plan_id = $1 ORDER BY e.nombre`,
      [planId],
    );
  }

  private exigirBorrador(planId: string): Promise<FilaPlan> {
    return this.buscar(planId).then((plan) => {
      if (plan.estado !== 'BORRADOR') throw new ConflictException({ codigo: 'PLAN_APROBADO', mensaje: 'Este plan ya está aprobado; no se puede modificar.' });
      return plan;
    });
  }

  private async buscar(id: string): Promise<FilaPlan> {
    const [fila] = await this.datos.query(`SELECT ${COLUMNAS_PLAN} FROM planes_logisticos WHERE id = $1`, [id]);
    if (!fila) throw new NotFoundException({ codigo: 'PLAN_NO_ENCONTRADO', mensaje: 'El plan logístico no existe.' });
    return fila;
  }

  private anotar(planId: string, tipo: string, usuario: string | null, detalle: Record<string, unknown>, m: EntityManager | DataSource = this.datos) {
    return m.query(`INSERT INTO bitacora_planificacion (plan_id, tipo, detalle, realizado_por) VALUES ($1, $2, $3, $4)`, [planId, tipo, JSON.stringify(detalle), usuario]);
  }
}
