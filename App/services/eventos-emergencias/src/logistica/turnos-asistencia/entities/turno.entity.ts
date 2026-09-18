import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  type Relation,
} from 'typeorm';
import { EstadoTurno } from '../enums/estados.js';
import { Empleado } from './empleado.entity.js';

@Entity('turnos')
export class Turno {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // `Relation<T>` (en vez de `Empleado` directo) evita que el metadata de
  // decoradores emitido por TS necesite una referencia en tiempo de
  // ejecución a la clase `Empleado` aquí — Turno y Empleado se importan
  // mutuamente (relación inversa), y esa referencia directa revienta con
  // un ReferenceError de TDZ al cargar los módulos ESM circulares.
  @ManyToOne(() => Empleado, (empleado) => empleado.turnos, { eager: true })
  @JoinColumn({ name: 'empleadoId' })
  empleado: Relation<Empleado>;

  @Column()
  empleadoId: string;

  @Column()
  eventoId: string;

  @Column()
  zona: string;

  @Column({ type: 'timestamptz' })
  horaInicio: Date;

  @Column({ type: 'timestamptz' })
  horaFin: Date;

  @Column({ type: 'enum', enum: EstadoTurno, default: EstadoTurno.ASIGNADO })
  estado: EstadoTurno;

  /**
   * CU-017: la zona de evento que este turno cubre, cuando se creó a través
   * de la asignación de personal operativo (no por el flujo simple de
   * `POST /turnos`, que puede seguir sin ella — de ahí nullable).
   */
  @Column('uuid', { nullable: true })
  zonaEventoId: string | null;
}
