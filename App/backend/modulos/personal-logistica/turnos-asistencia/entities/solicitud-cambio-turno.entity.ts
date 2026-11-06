import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { EstadoSolicitudCambio, RespuestaReemplazo } from '../enums/estados';
import { Empleado } from './empleado.entity';
import { Turno } from './turno.entity';

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

  /**
   * CU-008: quién pidió el cambio. Al aprobarlo el turno pasa al reemplazo, y
   * esto es lo que permite devolvérselo si el reemplazo lo rechaza (CU-008C).
   * Nulo en las solicitudes anteriores a este caso de uso.
   */
  @Column('uuid', { nullable: true })
  empleadoSolicitanteId: string | null;

  @Column({ type: 'varchar', length: 10, nullable: true })
  respuestaReemplazo: RespuestaReemplazo | null;

  /** Quienes ya rechazaron cubrir este turno: no se les vuelve a proponer. */
  @Column('uuid', { array: true, default: () => "'{}'" })
  reemplazosDescartados: string[];
}
