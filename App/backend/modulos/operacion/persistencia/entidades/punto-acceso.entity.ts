import { Column, Entity, PrimaryColumn } from 'typeorm';

export enum EstadoPuntoAcceso { HABILITADO = 'HABILITADO', CERRADO = 'CERRADO' }

/** Estado de una entrada del evento según las decisiones del supervisor (CU-019C). */
@Entity({ name: 'puntos_acceso' })
export class PuntoAcceso {
  @PrimaryColumn({ name: 'evento_id', type: 'uuid' }) eventoId: string;
  @PrimaryColumn({ type: 'varchar', length: 120 }) nombre: string;
  @Column({ type: 'enum', enum: EstadoPuntoAcceso, enumName: 'punto_acceso_estado', default: EstadoPuntoAcceso.HABILITADO }) estado: EstadoPuntoAcceso;
  /** Entrada que recibe a la gente mientras esta está cerrada. */
  @Column({ type: 'varchar', length: 120, nullable: true }) alternativa: string | null;
  @Column({ name: 'actualizado_por', type: 'uuid', nullable: true }) actualizadoPor: string | null;
  @Column({ name: 'actualizado_en', type: 'timestamptz', default: () => 'now()' }) actualizadoEn: Date;
}
