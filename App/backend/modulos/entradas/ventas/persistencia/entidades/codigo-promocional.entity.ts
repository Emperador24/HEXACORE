import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

/**
 * Código promocional (CU-004).
 *
 * Un código puede servir para todo el catálogo, para un evento o para una
 * localidad concreta (CU-004A). `usos` cuenta los usos **reservados o
 * confirmados**: se incrementa al aplicarlo a una compra y se devuelve si esa
 * compra se abandona. El `CHECK (usos <= limite_usos)` de la migración es lo
 * que impide pasarse del límite aunque muchos clientes lo apliquen a la vez
 * (atributo de Consistencia del CU-004).
 */
@Entity({ name: 'codigos_promocionales' })
export class CodigoPromocional {
  /** Siempre en mayúsculas: `hexa10` y `HEXA10` son el mismo código. */
  @PrimaryColumn({ name: 'codigo', type: 'varchar', length: 40 })
  codigo: string;

  @Column({ name: 'descripcion', type: 'varchar', length: 200 })
  descripcion: string;

  /** Porcentaje de descuento sobre el subtotal, de 1 a 90 (nunca gratis: la pasarela no cobra 0). */
  @Column({ name: 'porcentaje', type: 'integer' })
  porcentaje: number;

  /** Null = sirve para cualquier evento. */
  @Column({ name: 'evento_id', type: 'uuid', nullable: true })
  eventoId: string | null;

  /** Null = sirve para cualquier localidad (del evento, si lo hay). */
  @Column({ name: 'localidad_id', type: 'uuid', nullable: true })
  localidadId: string | null;

  @Column({ name: 'vigente_desde', type: 'timestamptz' })
  vigenteDesde: Date;

  @Column({ name: 'vigente_hasta', type: 'timestamptz' })
  vigenteHasta: Date;

  /** Null = sin límite. */
  @Column({ name: 'limite_usos', type: 'integer', nullable: true })
  limiteUsos: number | null;

  @Column({ name: 'usos', type: 'integer', default: 0 })
  usos: number;

  @Column({ name: 'activo', type: 'boolean', default: true })
  activo: boolean;

  @CreateDateColumn({ name: 'creado_en', type: 'timestamptz' })
  creadoEn: Date;
}
