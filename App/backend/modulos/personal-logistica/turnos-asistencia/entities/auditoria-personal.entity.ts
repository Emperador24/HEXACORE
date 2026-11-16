import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

/**
 * CU-007, atributo de trazabilidad: cada alta, edición, desactivación,
 * asignación y respuesta del empleado deja una fila. Solo se inserta; el
 * servicio no ofrece ni editar ni borrar.
 */
@Entity('auditoria_personal')
export class AuditoriaPersonal {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  accion: string;

  @Column('uuid', { nullable: true })
  empleadoId: string | null;

  @Column('uuid', { nullable: true })
  turnoId: string | null;

  /** `id` de la cuenta (CU-027) que hizo la operación, tomado de la sesión. */
  @Column('uuid')
  realizadoPor: string;

  /** Qué cambió: valores anteriores y nuevos, motivo, horario. */
  @Column('jsonb', { default: {} })
  detalle: Record<string, unknown>;

  @CreateDateColumn({ type: 'timestamptz' })
  fecha: Date;
}
