import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Puntualidad, TipoRegistroAsistencia } from '../enums/estados';
import { Empleado } from './empleado.entity';
import { Turno } from './turno.entity';

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
   * CU-009A/B/C: entrada anticipada, a tiempo o tardía; salida anticipada, a
   * tiempo o posterior. Nulo si no hay turno contra el que comparar.
   */
  @Column({ type: 'varchar', length: 20, nullable: true })
  puntualidad: Puntualidad | null;

  /** Minutos respecto a la hora del turno: negativo antes, positivo después. */
  @Column('int', { nullable: true })
  minutosDesviacion: number | null;

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
