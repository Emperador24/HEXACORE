import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager } from 'typeorm';
import { EventosService } from '../../eventos-recintos/eventos/eventos.service';
import { CONEXION_LOGISTICA } from '../persistencia/conexion';
import { ActualizarProveedorDto, DarDeBajaProveedorDto, RegistrarProveedorDto, TipoServicio } from './dto/proveedores.dto';

export interface ArchivoSubido { buffer: Buffer; mimetype: string; size: number }

export const TIPOS_DOCUMENTO = ['application/pdf', 'image/png', 'image/jpeg'];
export const MAX_DOCUMENTO_BYTES = 5_000_000;

export interface FilaProveedor {
  id: string; nombre: string; tipoServicio: TipoServicio; nombreContacto: string | null; telefono: string | null;
  correo: string | null; direccion: string | null; costoReferencia: number | null; estado: 'ACTIVO' | 'INACTIVO';
  creadoPor: string; creadoEn: Date; actualizadoEn: Date;
}

const COLUMNAS = `id, nombre, tipo_servicio AS "tipoServicio", nombre_contacto AS "nombreContacto", telefono, correo,
  direccion, costo_referencia AS "costoReferencia", estado, creado_por AS "creadoPor", creado_en AS "creadoEn", actualizado_en AS "actualizadoEn"`;

/**
 * CU-030: Gestión de Proveedores.
 *
 * Registra, edita y da de baja proveedores externos que la planificación
 * logística (CU-016) ofrece para asignar a un evento. «Asignaciones activas»
 * (CU-030A/B) es su presencia en `plan_proveedores` de un plan cuyo evento
 * todavía no ha terminado — ahí es donde de verdad importaría un cambio.
 */
@Injectable()
export class ProveedoresService {
  constructor(
    @InjectDataSource(CONEXION_LOGISTICA) private readonly datos: DataSource,
    private readonly eventos: EventosService,
  ) {}

  async registrar(dto: RegistrarProveedorDto, creadoPor: string): Promise<FilaProveedor> {
    const [{ id }] = await this.datos.query(
      `INSERT INTO proveedores (nombre, tipo_servicio, nombre_contacto, telefono, correo, direccion, costo_referencia, creado_por)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [dto.nombre.trim(), dto.tipoServicio, dto.nombreContacto?.trim() || null, dto.telefono?.trim() || null,
        dto.correo?.trim() || null, dto.direccion?.trim() || null, dto.costoReferencia ?? null, creadoPor],
    );
    return this.buscar(id);
  }

  async listar(soloActivos = true, tipoServicio?: TipoServicio): Promise<FilaProveedor[]> {
    const condiciones: string[] = [];
    const parametros: unknown[] = [];
    if (soloActivos) condiciones.push(`estado = 'ACTIVO'`);
    if (tipoServicio) { parametros.push(tipoServicio); condiciones.push(`tipo_servicio = $${parametros.length}`); }
    const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';
    return this.datos.query(`SELECT ${COLUMNAS} FROM proveedores ${where} ORDER BY nombre`, parametros);
  }

  async detalle(id: string) {
    const proveedor = await this.buscar(id);
    const [documentos, historial] = await Promise.all([
      this.datos.query(`SELECT id, nombre, tipo, tamano, subido_en AS "subidoEn" FROM documentos_proveedor WHERE proveedor_id = $1 ORDER BY subido_en DESC`, [id]),
      this.historialServicios(id),
    ]);
    return { proveedor, documentos, historialServicios: historial };
  }

  /** Quality attr «Trazabilidad»: los planes (eventos) a los que se ha asignado este proveedor. */
  private historialServicios(proveedorId: string) {
    return this.datos.query(
      `SELECT pl.id AS "planId", pl.evento_id AS "eventoId", pl.estado AS "estadoPlan", pp.costo, pp.actualizado_en AS "asignadoEn"
         FROM plan_proveedores pp JOIN planes_logisticos pl ON pl.id = pp.plan_id
        WHERE pp.proveedor_id = $1 ORDER BY pp.actualizado_en DESC LIMIT 100`,
      [proveedorId],
    );
  }

  /** CU-030A: editar un proveedor con asignaciones en eventos futuros exige confirmar el impacto. */
  async actualizar(id: string, dto: ActualizarProveedorDto): Promise<FilaProveedor> {
    await this.buscar(id);
    if (!dto.confirmarImpacto) {
      const eventosFuturos = await this.eventosFuturosAsignados(id);
      if (eventosFuturos.length) {
        throw new ConflictException({
          codigo: 'IMPACTO_PLANIFICACION',
          mensaje: `Este proveedor está asignado a ${eventosFuturos.length} evento(s) futuro(s); confirma para editarlo de todas formas.`,
          eventos: eventosFuturos,
        });
      }
    }
    await this.datos.query(
      `UPDATE proveedores SET nombre=$2, tipo_servicio=$3, nombre_contacto=$4, telefono=$5, correo=$6, direccion=$7, costo_referencia=$8, actualizado_en=now() WHERE id=$1`,
      [id, dto.nombre.trim(), dto.tipoServicio, dto.nombreContacto?.trim() || null, dto.telefono?.trim() || null,
        dto.correo?.trim() || null, dto.direccion?.trim() || null, dto.costoReferencia ?? null],
    );
    return this.buscar(id);
  }

  /** CU-030B: dar de baja con asignaciones activas exige confirmar. */
  async darDeBaja(id: string, dto: DarDeBajaProveedorDto): Promise<FilaProveedor> {
    const proveedor = await this.buscar(id);
    if (proveedor.estado === 'INACTIVO') return proveedor;
    if (!dto.confirmar) {
      const eventosFuturos = await this.eventosFuturosAsignados(id);
      if (eventosFuturos.length) {
        throw new ConflictException({
          codigo: 'ASIGNACIONES_ACTIVAS',
          mensaje: `Este proveedor tiene ${eventosFuturos.length} asignación(es) activa(s); confirma para darlo de baja igual.`,
          eventos: eventosFuturos,
        });
      }
    }
    await this.datos.query(`UPDATE proveedores SET estado='INACTIVO', actualizado_en=now() WHERE id=$1`, [id]);
    return this.buscar(id);
  }

  async reactivar(id: string): Promise<FilaProveedor> {
    await this.buscar(id);
    await this.datos.query(`UPDATE proveedores SET estado='ACTIVO', actualizado_en=now() WHERE id=$1`, [id]);
    return this.buscar(id);
  }

  /** Eventos futuros (no terminados) donde este proveedor está en el plan: lo que CU-030A/B llaman «asignaciones activas». */
  private async eventosFuturosAsignados(proveedorId: string): Promise<{ eventoId: string; nombre: string; fechaInicio: Date }[]> {
    const planes: { eventoId: string }[] = await this.datos.query(
      `SELECT pl.evento_id AS "eventoId" FROM plan_proveedores pp JOIN planes_logisticos pl ON pl.id = pp.plan_id WHERE pp.proveedor_id = $1`,
      [proveedorId],
    );
    if (!planes.length) return [];
    const ahora = Date.now();
    const resultados: { eventoId: string; nombre: string; fechaInicio: Date }[] = [];
    for (const { eventoId } of planes) {
      const { evento } = await this.eventos.detalle(eventoId).catch(() => ({ evento: null }));
      if (evento && evento.fechaFin.getTime() > ahora) resultados.push({ eventoId, nombre: evento.nombre, fechaInicio: evento.fechaInicio });
    }
    return resultados;
  }

  // --- Documentos / certificaciones (paso 3) ---------------------------------------

  async subirDocumento(proveedorId: string, nombre: string, archivo: ArchivoSubido | undefined, subidoPor: string) {
    await this.buscar(proveedorId);
    if (!archivo) throw new BadRequestException({ codigo: 'DOCUMENTO_FALTANTE', mensaje: 'Adjunta el documento o certificación.' });
    if (!TIPOS_DOCUMENTO.includes(archivo.mimetype)) {
      throw new BadRequestException({ codigo: 'DOCUMENTO_TIPO', mensaje: 'El documento debe ser PDF, PNG o JPG.' });
    }
    if (archivo.size > MAX_DOCUMENTO_BYTES) {
      throw new BadRequestException({ codigo: 'DOCUMENTO_GRANDE', mensaje: 'El documento no puede pasar de 5 MB.' });
    }
    if (!this.firmaValida(archivo)) {
      throw new BadRequestException({ codigo: 'DOCUMENTO_TIPO', mensaje: 'El archivo no es del tipo que dice ser.' });
    }
    const [{ id }] = await this.datos.query(
      `INSERT INTO documentos_proveedor (proveedor_id, nombre, tipo, contenido, tamano, subido_por) VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      [proveedorId, nombre.trim() || 'Documento', archivo.mimetype, archivo.buffer, archivo.size, subidoPor],
    );
    return { id, tipo: archivo.mimetype, tamano: archivo.size };
  }

  async documento(proveedorId: string, documentoId: string) {
    const [fila] = await this.datos.query(
      `SELECT nombre, tipo, contenido, tamano FROM documentos_proveedor WHERE id = $1 AND proveedor_id = $2`,
      [documentoId, proveedorId],
    );
    if (!fila) throw new NotFoundException({ codigo: 'DOCUMENTO_NO_ENCONTRADO', mensaje: 'El documento no existe.' });
    return fila;
  }

  async eliminarDocumento(proveedorId: string, documentoId: string): Promise<void> {
    await this.datos.query(`DELETE FROM documentos_proveedor WHERE id = $1 AND proveedor_id = $2`, [documentoId, proveedorId]);
  }

  private firmaValida({ buffer, mimetype }: ArchivoSubido): boolean {
    const b = buffer.subarray(0, 8);
    if (mimetype === 'application/pdf') return b.subarray(0, 5).equals(Buffer.from('%PDF-', 'ascii'));
    if (mimetype === 'image/png') return b.equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    if (mimetype === 'image/jpeg') return b.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]));
    return false;
  }

  // --- Apoyo -------------------------------------------------------------------------

  async buscar(id: string, m: EntityManager | DataSource = this.datos): Promise<FilaProveedor> {
    const [fila] = await m.query(`SELECT ${COLUMNAS} FROM proveedores WHERE id = $1`, [id]);
    if (!fila) throw new NotFoundException({ codigo: 'PROVEEDOR_NO_ENCONTRADO', mensaje: 'El proveedor no existe.' });
    return fila;
  }
}
