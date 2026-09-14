import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { EstadoSolicitudCambio } from '../enums/estados.js';
import { Empleado } from './empleado.entity.js';
import { Turno } from './turno.entity.js';

@Entity('solicitudes_cambio_turno')
export class SolicitudCambioTurno {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Turno, { eager: true })
  @JoinColumn({ name: 'turnoId' })
  turno: Turno;

  @Column()
  turnoId: string;

  @Column()
  motivo: string;

  @ManyToOne(() => Empleado, { eager: true, nullable: true })
  @JoinColumn({ name: 'empleadoReemplazoId' })
  empleadoReemplazo: Empleado | null;

  @Column({ type: 'varchar', nullable: true })
  empleadoReemplazoId: string | null;

  @Column({
    type: 'enum',
    enum: EstadoSolicitudCambio,
    default: EstadoSolicitudCambio.PENDIENTE,
  })
  estado: EstadoSolicitudCambio;

  @Column({ type: 'varchar', nullable: true })
  revisadoPorId: string | null;

  @Column({ type: 'varchar', nullable: true })
  motivoRechazoOBloqueo: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  fechaSolicitud: Date;

  @Column({ type: 'timestamptz', nullable: true })
  fechaRevision: Date | null;
}
