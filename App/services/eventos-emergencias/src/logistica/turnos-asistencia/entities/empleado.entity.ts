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

  /**
   * Referencia lógica (no FK física, ADR-01) al `id` del usuario en el
   * Servicio de Administración (CU-027) — el mismo patrón que
   * `propietario_id` en Entradas. Es lo que permite pasar del `sub` del
   * token de sesión a "qué empleado es" (RNF-06).
   */
  @Column('uuid', { unique: true })
  usuarioId: string;

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
