import { Column, Entity, PrimaryColumn } from 'typeorm';

/** CU-029 paso 5: el plano del recinto. Una imagen por recinto; reemplazarla pisa la anterior. */
@Entity({ name: 'planos_recinto' })
export class PlanoRecinto {
  @PrimaryColumn({ name: 'recinto_id', type: 'uuid' })
  recintoId: string;

  @Column({ type: 'varchar', length: 40 })
  tipo: string;

  @Column({ type: 'bytea' })
  contenido: Buffer;

  @Column({ type: 'integer' })
  tamano: number;

  @Column({ name: 'actualizado_en', type: 'timestamptz', default: () => 'now()' })
  actualizadoEn: Date;
}
