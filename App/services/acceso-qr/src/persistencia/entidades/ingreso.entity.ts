import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/**
 * - `EN_LINEA`: validado en el momento contra el servidor (flujo básico del CU-002).
 * - `SINCRONIZADO`: validado sin conexión contra la caché del dispositivo y
 *   subido después (CU-002E).
 */
export enum OrigenIngreso {
  EN_LINEA = 'EN_LINEA',
  SINCRONIZADO = 'SINCRONIZADO',
}

/**
 * Registro de ingreso al evento (post-condición 1 del CU-002: *"Registro de la
 * hora de acceso"*).
 *
 * `entrada_id` es **único**: es la segunda barrera, en el motor, de *"un mismo
 * QR no puede validar dos ingresos simultáneos"*. La primera es el `UPDATE ...
 * WHERE estado = 'VALIDA'` sobre la entrada.
 */
@Entity({ name: 'ingresos' })
@Index('idx_ingresos_evento', ['eventoId'])
export class Ingreso {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'entrada_id', type: 'uuid', unique: true })
  entradaId: string;

  @Column({ name: 'evento_id', type: 'uuid' })
  eventoId: string;

  /** Quién escaneó: el `sub` del token del personal de ingreso. */
  @Column({ name: 'validado_por', type: 'uuid' })
  validadoPor: string;

  /** "Puerta 3", "Acceso VIP"… lo que el dispositivo declare. */
  @Column({ name: 'punto_acceso', type: 'varchar', length: 60, nullable: true })
  puntoAcceso: string | null;

  @Column({ name: 'origen', type: 'enum', enum: OrigenIngreso, enumName: 'ingreso_origen' })
  origen: OrigenIngreso;

  /** Hora real del escaneo. En un ingreso sincronizado es anterior a `registradoEn`. */
  @Column({ name: 'escaneado_en', type: 'timestamptz' })
  escaneadoEn: Date;

  @CreateDateColumn({ name: 'registrado_en', type: 'timestamptz' })
  registradoEn: Date;
}
