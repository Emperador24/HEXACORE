import {
  Column,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  type Relation,
} from 'typeorm';
import { Turno } from './turno.entity.js';

@Entity('empleados')
export class Empleado {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  nombre: string;

  @Column()
  rol: string;

  @Column({ unique: true })
  credencial: string;

  @Column({ default: true })
  activo: boolean;

  @Column('float', { default: 0 })
  horasTrabajadasTotales: number;

  @OneToMany(() => Turno, (turno) => turno.empleado)
  turnos: Relation<Turno>[];
}
