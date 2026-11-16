import { Column, Entity, Generated, PrimaryColumn } from 'typeorm';

export type EstadoOperacionInventario = 'PENDIENTE' | 'APLICADA' | 'RECHAZADA';
@Entity({ name: 'operaciones_inventario' })
export class OperacionInventario {
  @PrimaryColumn('uuid') id: string;
  @Column({ type: 'bigint' }) @Generated('increment') secuencia: string;
  @Column({ name: 'establecimiento_id', type: 'uuid' }) establecimientoId: string;
  @Column({ name: 'producto_id', type: 'uuid' }) productoId: string;
  @Column({ name: 'actor_id', type: 'uuid' }) actorId: string;
  @Column({ type: 'varchar', length: 10 }) tipo: 'ALTA' | 'AJUSTE';
  @Column({ type: 'integer' }) delta: number;
  @Column({ type: 'varchar', length: 500 }) motivo: string;
  @Column({ type: 'char', length: 64 }) huella: string;
  @Column({ type: 'jsonb' }) peticion: object;
  @Column({ type: 'boolean', default: false }) inicializa: boolean;
  @Column({ type: 'varchar', length: 12, default: 'PENDIENTE' }) estado: EstadoOperacionInventario;
  @Column({ type: 'varchar', length: 80, nullable: true }) codigo: string | null;
  @Column({ name: 'fisico_antes', type: 'integer', nullable: true }) fisicoAntes: number | null;
  @Column({ name: 'fisico_despues', type: 'integer', nullable: true }) fisicoDespues: number | null;
  @Column({ name: 'disponible_antes', type: 'integer', nullable: true }) disponibleAntes: number | null;
  @Column({ name: 'disponible_despues', type: 'integer', nullable: true }) disponibleDespues: number | null;
  @Column({ name: 'creada_en', type: 'timestamptz', default: () => 'now()' }) creadaEn: Date;
  @Column({ name: 'terminada_en', type: 'timestamptz', nullable: true }) terminadaEn: Date | null;
}
