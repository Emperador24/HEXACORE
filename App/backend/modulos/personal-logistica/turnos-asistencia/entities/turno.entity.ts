import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  type Relation,
} from 'typeorm';
import { ConfirmacionTurno, EstadoTurno } from '../enums/estados';
import { Empleado } from './empleado.entity';

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

  /**
   * CU-007 paso 13 y CU-007B: lo que respondió el empleado a la asignación.
   * Va aparte de `estado`, que es el ciclo del turno en CU-018 (cambios):
   * mezclarlos obligaría a reescribir cada regla de cambio de turno.
   */
  @Column({ type: 'enum', enum: ConfirmacionTurno, default: ConfirmacionTurno.PENDIENTE })
  confirmacion: ConfirmacionTurno;

  @Column({ type: 'varchar', nullable: true })
  motivoRechazo: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  respondidoEn: Date | null;
}
