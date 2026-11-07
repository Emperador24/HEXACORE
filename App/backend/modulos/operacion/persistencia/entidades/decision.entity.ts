import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

export enum TipoDecision {
  REDISTRIBUIR_PERSONAL = 'REDISTRIBUIR_PERSONAL',
  CERRAR_ACCESO = 'CERRAR_ACCESO',
  HABILITAR_ACCESO = 'HABILITAR_ACCESO',
  ESCALAR_INCIDENTE = 'ESCALAR_INCIDENTE',
  OTRA = 'OTRA',
}

/** Paso 7-8: una decisión operativa del supervisor y, después, su resultado. */
@Entity({ name: 'decisiones' })
export class Decision {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'evento_id', type: 'uuid' }) eventoId: string;
  @Column({ type: 'varchar', length: 40 }) tipo: TipoDecision;
  @Column({ type: 'text' }) descripcion: string;
  @Column({ type: 'varchar', length: 120, nullable: true }) zona: string | null;
  @Column({ name: 'punto_acceso', type: 'varchar', length: 120, nullable: true }) puntoAcceso: string | null;
  @Column({ type: 'varchar', length: 120, nullable: true }) alternativa: string | null;
  @Column({ name: 'alerta_id', type: 'uuid', nullable: true }) alertaId: string | null;
  @Column({ type: 'text', nullable: true }) resultado: string | null;
  @Column({ name: 'realizado_por', type: 'uuid' }) realizadoPor: string;
  @Column({ type: 'timestamptz', default: () => 'now()' }) fecha: Date;
  @Column({ name: 'resultado_en', type: 'timestamptz', nullable: true }) resultadoEn: Date | null;
}
