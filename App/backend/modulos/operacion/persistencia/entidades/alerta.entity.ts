import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

export type Severidad = 'info' | 'aviso' | 'critica';

/**
 * Alerta automática (paso 4). `clave` identifica la situación —por ejemplo
 * `CONGESTION:Puerta Norte`—: mientras siga activa no se vuelve a crear, y
 * cuando desaparece queda resuelta con su hora.
 */
@Entity({ name: 'alertas' })
export class Alerta {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ name: 'evento_id', type: 'uuid' }) eventoId: string;
  @Column({ type: 'varchar', length: 40 }) tipo: string;
  @Column({ type: 'varchar', length: 200 }) clave: string;
  @Column({ type: 'varchar', length: 10 }) severidad: Severidad;
  @Column({ type: 'text' }) mensaje: string;
  @Column({ type: 'jsonb', nullable: true }) sugerencia: Record<string, unknown> | null;
  @Column({ name: 'creada_en', type: 'timestamptz', default: () => 'now()' }) creadaEn: Date;
  @Column({ name: 'resuelta_en', type: 'timestamptz', nullable: true }) resueltaEn: Date | null;
}
