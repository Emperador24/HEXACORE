import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * Evidencia persistida de los mensajes recibidos por el consumidor de la
 * cola "turnos.cambios" (Publicador de Eventos, SAD §9). Permite demostrar
 * en vivo la propagación asíncrona de un cambio de turno aprobado.
 */
@Entity('notificaciones')
export class Notificacion {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  tipo: string;

  @Column()
  turnoId: string;

  @Column()
  empleadoId: string;

  @Column()
  mensaje: string;

  @Column('float')
  latenciaMs: number;

  @CreateDateColumn({ type: 'timestamptz' })
  recibidoEn: Date;
}
