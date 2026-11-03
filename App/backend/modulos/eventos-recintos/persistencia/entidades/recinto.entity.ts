import { Column, Entity, OneToMany, PrimaryGeneratedColumn, type Relation } from 'typeorm';
import { ZonaRecinto } from './zona-recinto.entity';

/**
 * Recinto con su capacidad física (precondición 2 y paso 4 del CU-026).
 *
 * Solo lo mínimo que la gestión de eventos necesita: administrar recintos y
 * zonas es el CU-029. Aquí se leen; se crean con la semilla.
 */
@Entity({ name: 'recintos' })
export class Recinto {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 200 })
  nombre: string;

  @Column({ type: 'varchar', length: 120 })
  ciudad: string;

  @Column({ type: 'varchar', length: 200, nullable: true })
  direccion: string | null;

  @Column({ type: 'integer' })
  capacidad: number;

  @Column({ type: 'boolean', default: true })
  activo: boolean;

  @OneToMany(() => ZonaRecinto, (zona) => zona.recinto, { eager: true })
  zonas: Relation<ZonaRecinto>[];
}
