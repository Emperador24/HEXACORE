import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { transformadorMonto } from '../columnas';

/**
 * - `RESERVADO`: aplicado a una compra que aún no se paga. Ya cuenta para el límite.
 * - `CONFIRMADO`: la compra se pagó.
 * - `LIBERADO`: se quitó el código (CU-004B) o la reserva venció; el uso se devolvió.
 */
export enum EstadoUsoPromocion {
  RESERVADO = 'RESERVADO',
  CONFIRMADO = 'CONFIRMADO',
  LIBERADO = 'LIBERADO',
}

/**
 * Registro del uso de un cupón por un usuario (post-condición del CU-004:
 * *"Registro del uso del cupón en la base de datos"*).
 *
 * Una compra solo puede tener un uso vivo a la vez (índice único parcial de la
 * migración): aplicar un segundo código sin quitar el primero es un error, no
 * una suma de descuentos.
 */
@Entity({ name: 'usos_promocion' })
@Index('idx_usos_promocion_codigo', ['codigo'])
export class UsoPromocion {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ name: 'codigo', type: 'varchar', length: 40 })
  codigo: string;

  @Column({ name: 'compra_id', type: 'uuid' })
  compraId: string;

  @Column({ name: 'usuario_id', type: 'uuid' })
  usuarioId: string;

  @Column({ name: 'descuento', type: 'numeric', precision: 12, scale: 2, transformer: transformadorMonto })
  descuento: number;

  @Column({ name: 'estado', type: 'enum', enum: EstadoUsoPromocion, enumName: 'uso_promocion_estado' })
  estado: EstadoUsoPromocion;

  @CreateDateColumn({ name: 'registrado_en', type: 'timestamptz' })
  registradoEn: Date;

  @UpdateDateColumn({ name: 'actualizado_en', type: 'timestamptz' })
  actualizadoEn: Date;
}
