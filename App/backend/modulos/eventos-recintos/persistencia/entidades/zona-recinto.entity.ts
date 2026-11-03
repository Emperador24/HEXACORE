import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, type Relation } from 'typeorm';
import { Recinto } from './recinto.entity';

/** Zona física de un recinto. Una localidad que la ocupa no puede superar su capacidad (CU-026B). */
@Entity({ name: 'zonas_recinto' })
export class ZonaRecinto {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'recinto_id', type: 'uuid' })
  recintoId: string;

  @ManyToOne(() => Recinto, (recinto) => recinto.zonas, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'recinto_id' })
  recinto: Relation<Recinto>;

  @Column({ type: 'varchar', length: 120 })
  nombre: string;

  @Column({ type: 'integer' })
  capacidad: number;
}
