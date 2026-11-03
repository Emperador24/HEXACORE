import {
  Column,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  type Relation,
} from 'typeorm';
import { Turno } from './turno.entity';

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

  /**
   * CU-007: datos de contacto de la ficha. Únicos (paso 4) y nulos en las
   * fichas dadas de alta antes de este caso de uso. El correo se guarda en
   * minúsculas para que la unicidad no dependa de cómo se escribió.
   */
  @Column({ type: 'varchar', nullable: true, unique: true })
  documento: string | null;

  @Column({ type: 'varchar', nullable: true, unique: true })
  correo: string | null;

  @Column({ type: 'varchar', nullable: true })
  telefono: string | null;

  @Column({ default: true })
  activo: boolean;

  @Column('float', { default: 0 })
  horasTrabajadasTotales: number;

  @OneToMany(() => Turno, (turno) => turno.empleado)
  turnos: Relation<Turno>[];
}
