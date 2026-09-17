import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { TipoRegistroAsistencia } from '../enums/estados.js';
import { Empleado } from './empleado.entity.js';
import { Turno } from './turno.entity.js';

@Entity('registros_asistencia')
export class RegistroAsistencia {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Empleado, { eager: true })
  @JoinColumn({ name: 'empleadoId' })
  empleado: Empleado;

  @Column()
  empleadoId: string;

  @ManyToOne(() => Turno, { eager: true, nullable: true })
  @JoinColumn({ name: 'turnoId' })
  turno: Turno | null;

  @Column({ type: 'varchar', nullable: true })
  turnoId: string | null;

  @Column({ type: 'enum', enum: TipoRegistroAsistencia })
  tipo: TipoRegistroAsistencia;

  @Column()
  credencialUsada: string;

  @Column({ default: false })
  anomalia: boolean;

  @Column({ type: 'varchar', nullable: true })
  motivoAnomalia: string | null;

  @Column('float', { nullable: true })
  horasCalculadas: number | null;

  /**
   * Momento real del evento. Si el dispositivo de control lo registró sin
   * conexión, es la hora local del dispositivo (enviada al sincronizar),
   * no la hora del servidor — soporte de modo offline-first (CU-018).
   */
  @Column({ type: 'timestamptz' })
  timestamp: Date;

  /**
   * Clave generada por el dispositivo de control al crear el registro
   * localmente (offline). Permite reintentar la sincronización sin crear
   * duplicados si la respuesta original se perdió por falta de conexión.
   */
  @Column({ type: 'varchar', nullable: true, unique: true })
  idempotencyKey: string | null;

  @Column({ type: 'timestamptz' })
  sincronizadoEn: Date;
}
