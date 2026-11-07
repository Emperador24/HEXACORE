import { Column, Entity, OneToMany, PrimaryGeneratedColumn, type Relation } from 'typeorm';
import { ZonaRecinto } from './zona-recinto.entity';

/**
 * Recinto con su capacidad física (precondición 2 y paso 4 del CU-026).
 * Lo administra el CU-029 (`recintos/recintos.service.ts`).
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

  @Column({ name: 'actualizado_por', type: 'uuid', nullable: true })
  actualizadoPor: string | null;

  @Column({ name: 'actualizado_en', type: 'timestamptz', default: () => 'now()' })
  actualizadoEn: Date;

  @OneToMany(() => ZonaRecinto, (zona) => zona.recinto, { eager: true })
  zonas: Relation<ZonaRecinto>[];
}
