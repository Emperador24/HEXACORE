import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, type Relation } from 'typeorm';
import { Evento } from './evento.entity';

const monto = { to: (v: number) => v, from: (v: string | null) => (v === null ? null : Number(v)) };

/**
 * Tipo de entrada de un evento: nombre, precio y cantidad a la venta (paso 3).
 * Su `id` es el `localidad_id` que usan las copias y las entradas de Boletería.
 */
@Entity({ name: 'localidades' })
export class Localidad {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'evento_id', type: 'uuid' })
  eventoId: string;

  @ManyToOne(() => Evento, (evento) => evento.localidades, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'evento_id' })
  evento: Relation<Evento>;

  /** Zona física que ocupa, si el recinto tiene zonas. */
  @Column({ name: 'zona_recinto_id', type: 'uuid', nullable: true })
  zonaRecintoId: string | null;

  @Column({ type: 'varchar', length: 120 })
  nombre: string;

  @Column({ type: 'numeric', precision: 12, scale: 2, transformer: monto })
  precio: number;

  @Column({ type: 'integer' })
  cantidad: number;

  @Column({ type: 'smallint', default: 0 })
  orden: number;
}
