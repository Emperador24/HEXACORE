import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { EventoReferencia } from './evento-referencia.entity';

/** Disponibilidad operativa para recibir pedidos en CU-011. */
export enum EstadoEstablecimiento {
  DISPONIBLE = 'DISPONIBLE',
  CERRADO = 'CERRADO',
  SATURADO = 'SATURADO',
  DESHABILITADO = 'DESHABILITADO',
}

/** Establecimiento de alimentos asociado a un evento, con un punto de entrega. */
@Entity({ name: 'establecimientos' })
@Index('idx_establecimientos_evento', ['eventoId'])
export class Establecimiento {
  @PrimaryGeneratedColumn('uuid', { name: 'id' })
  id: string;

  @Column({ name: 'evento_id', type: 'uuid' })
  eventoId: string;

  /** Referencia a la proyección local, sin duplicar los datos del evento. */
  @ManyToOne(() => EventoReferencia, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'evento_id', referencedColumnName: 'eventoId' })
  evento: EventoReferencia;

  @Column({ name: 'nombre', type: 'varchar', length: 200 })
  nombre: string;

  /** Cerrado o saturado distingue las causas del alterno CU-011C. */
  @Column({
    name: 'estado',
    type: 'enum',
    enum: EstadoEstablecimiento,
    enumName: 'establecimiento_estado',
    default: EstadoEstablecimiento.DESHABILITADO,
  })
  estado: EstadoEstablecimiento;

  @Column({ name: 'punto_entrega', type: 'varchar', length: 200 })
  puntoEntrega: string;
}
