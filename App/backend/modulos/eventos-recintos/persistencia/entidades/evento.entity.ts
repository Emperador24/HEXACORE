import { Column, Entity, OneToMany, PrimaryGeneratedColumn, type Relation } from 'typeorm';
import { Localidad } from './localidad.entity';

/**
 * Ciclo de vida del CU-026: borrador → publicado → cancelado. Es el mismo
 * enumerado que copian las proyecciones de Boletería (`eventos_referencia`).
 */
export enum EstadoEvento {
  BORRADOR = 'BORRADOR',
  PUBLICADO = 'PUBLICADO',
  CANCELADO = 'CANCELADO',
}

/**
 * El Evento: aquí está su dueño. Boletería guarda copias (`eventos_referencia`
 * en Ventas, Catálogo, Postventa y Acceso QR) que se mantienen con los
 * mensajes de `CONTRATO-EVENTOS.md`.
 */
@Entity({ name: 'eventos' })
export class Evento {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 200 })
  nombre: string;

  @Column({ type: 'text', nullable: true })
  descripcion: string | null;

  @Column({ type: 'varchar', length: 60 })
  categoria: string;

  @Column({ type: 'varchar', length: 200, nullable: true })
  artista: string | null;

  @Column({ name: 'imagen_url', type: 'varchar', length: 500, nullable: true })
  imagenUrl: string | null;

  @Column({ name: 'recinto_id', type: 'uuid' })
  recintoId: string;

  @Column({ name: 'fecha_inicio', type: 'timestamptz' })
  fechaInicio: Date;

  @Column({ name: 'fecha_fin', type: 'timestamptz' })
  fechaFin: Date;

  /** Personas dentro a la vez. No supera la capacidad del recinto; las localidades no lo superan a él. */
  @Column({ name: 'aforo_maximo', type: 'integer' })
  aforoMaximo: number;

  @Column({ name: 'permite_reventa', type: 'boolean', default: true })
  permiteReventa: boolean;

  @Column({ type: 'enum', enum: EstadoEvento, enumName: 'evento_estado', default: EstadoEvento.BORRADOR })
  estado: EstadoEvento;

  /**
   * Sube con cada cambio. Sirve para dos cosas: quien edita manda la versión
   * que vio y, si otro guardó antes, recibe 409 en vez de pisarlo; y Boletería
   * descarta un mensaje viejo que llegue después de uno nuevo.
   */
  @Column({ type: 'integer', default: 1 })
  version: number;

  @Column({ name: 'creado_por', type: 'uuid' })
  creadoPor: string;

  @Column({ name: 'creado_en', type: 'timestamptz', default: () => 'now()' })
  creadoEn: Date;

  @Column({ name: 'actualizado_en', type: 'timestamptz', default: () => 'now()' })
  actualizadoEn: Date;

  @Column({ name: 'publicado_en', type: 'timestamptz', nullable: true })
  publicadoEn: Date | null;

  @Column({ name: 'cancelado_en', type: 'timestamptz', nullable: true })
  canceladoEn: Date | null;

  @Column({ name: 'motivo_cancelacion', type: 'text', nullable: true })
  motivoCancelacion: string | null;

  @OneToMany(() => Localidad, (localidad) => localidad.evento, { cascade: true })
  localidades: Relation<Localidad>[];
}
