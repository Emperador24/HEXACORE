import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { transformadorMonto } from '../columnas';

/**
 * - `PENDIENTE`: las entradas ya se anularon y el reembolso está en la pasarela.
 * - `APROBADA`: el dinero se devolvió.
 * - `RECHAZADA`: la pasarela dijo que no; las entradas volvieron a ser válidas (CU-003C).
 * - `FALLIDA`: la pasarela no respondió; no se sabe si devolvió. Requiere conciliación.
 */
export enum EstadoCancelacion {
  PENDIENTE = 'PENDIENTE',
  APROBADA = 'APROBADA',
  RECHAZADA = 'RECHAZADA',
  FALLIDA = 'FALLIDA',
}

/**
 * Solicitud de cancelación y su reembolso (CU-003). Es el *"historial de la
 * compra"* del paso 8 y lo que hace auditable cada devolución (atributo de
 * Trazabilidad).
 */
@Entity({ name: 'cancelaciones' })
@Index('idx_cancelaciones_compra', ['compraId'])
export class Cancelacion {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'compra_id', type: 'uuid' })
  compraId: string;

  @Column({ name: 'solicitante_id', type: 'uuid' })
  solicitanteId: string;

  /** Entradas anuladas por esta cancelación. Puede ser un subconjunto de la compra (CU-003B). */
  @Column({ name: 'entradas_ids', type: 'uuid', array: true })
  entradasIds: string[];

  /** Porcentaje de reembolso según la política de plazos (100, el parcial, …). */
  @Column({ name: 'porcentaje_reembolso', type: 'integer' })
  porcentajeReembolso: number;

  @Column({ name: 'monto_reembolso', type: 'numeric', precision: 12, scale: 2, transformer: transformadorMonto })
  montoReembolso: number;

  @Column({ name: 'motivo', type: 'varchar', length: 500 })
  motivo: string;

  @Column({ name: 'estado', type: 'enum', enum: EstadoCancelacion, enumName: 'cancelacion_estado' })
  estado: EstadoCancelacion;

  @Column({ name: 'referencia_pasarela', type: 'varchar', length: 128, nullable: true })
  referenciaPasarela: string | null;

  @Column({ name: 'motivo_pasarela', type: 'text', nullable: true })
  motivoPasarela: string | null;

  @CreateDateColumn({ name: 'creada_en', type: 'timestamptz' })
  creadaEn: Date;

  @UpdateDateColumn({ name: 'actualizada_en', type: 'timestamptz' })
  actualizadaEn: Date;
}
