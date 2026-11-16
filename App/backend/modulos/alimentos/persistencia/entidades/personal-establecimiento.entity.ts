import { Column, Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { Establecimiento } from './establecimiento.entity';

/** Alcance local CU-012–014, independiente del catálogo global de roles CU-028. */
@Entity({ name: 'personal_establecimiento' })
export class PersonalEstablecimiento {
  @PrimaryColumn({ name: 'establecimiento_id', type: 'uuid' }) establecimientoId: string;
  @PrimaryColumn({ name: 'usuario_id', type: 'uuid' }) usuarioId: string;
  @Column({ name: 'asignado_por', type: 'uuid' }) asignadoPor: string;
  @ManyToOne(() => Establecimiento, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'establecimiento_id' }) establecimiento: Establecimiento;
}
