import { Column, Entity, PrimaryColumn } from 'typeorm';

/** Copia de un ingreso registrado por Acceso QR (CU-002), para el panel de aforo y accesos. */
@Entity({ name: 'ingresos' })
export class IngresoMonitoreado {
  @PrimaryColumn('uuid') id: string;
  @Column({ name: 'evento_id', type: 'uuid' }) eventoId: string;
  @Column({ name: 'punto_acceso', type: 'varchar', length: 120 }) puntoAcceso: string;
  @Column({ name: 'escaneado_en', type: 'timestamptz' }) escaneadoEn: Date;
  @Column({ name: 'recibido_en', type: 'timestamptz', default: () => 'now()' }) recibidoEn: Date;
}
