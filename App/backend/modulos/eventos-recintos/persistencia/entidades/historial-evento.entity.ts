import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { EstadoEvento } from './evento.entity';

/**
 * Historial versionado del evento (paso 9 y atributo de trazabilidad): quién,
 * cuándo, qué cambió y cómo quedó el evento entero en esa versión. Solo se
 * inserta.
 */
@Entity({ name: 'historial_eventos' })
export class HistorialEvento {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'evento_id', type: 'uuid' })
  eventoId: string;

  @Column({ type: 'integer' })
  version: number;

  /** CREADO, EDITADO, PUBLICADO, CANCELADO, ELIMINADO. */
  @Column({ type: 'varchar', length: 40 })
  accion: string;

  @Column({ name: 'estado_anterior', type: 'enum', enum: EstadoEvento, enumName: 'evento_estado', nullable: true })
  estadoAnterior: EstadoEvento | null;

  @Column({ name: 'estado_nuevo', type: 'enum', enum: EstadoEvento, enumName: 'evento_estado', nullable: true })
  estadoNuevo: EstadoEvento | null;

  @Column({ name: 'realizado_por', type: 'uuid' })
  realizadoPor: string;

  @Column({ type: 'jsonb', default: {} })
  cambios: Record<string, unknown>;

  @Column({ type: 'jsonb', nullable: true })
  instantanea: Record<string, unknown> | null;

  @Column({ type: 'timestamptz', default: () => 'now()' })
  fecha: Date;
}
