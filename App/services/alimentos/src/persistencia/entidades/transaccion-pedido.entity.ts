import {
  Check, Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne,
  PrimaryGeneratedColumn, UpdateDateColumn,
} from 'typeorm';
import { Pedido } from './pedido.entity';

/** Situación de un intento lógico de cobro de CU-011. */
export enum EstadoTransaccionPedido {
  PENDIENTE = 'PENDIENTE',
  APROBADA = 'APROBADA',
  RECHAZADA = 'RECHAZADA',
  /** Error técnico o timeout: no demuestra que no hubo cobro. */
  FALLIDA = 'FALLIDA',
}

/** Registro del intento de pago, sin token de pago ni datos de tarjeta (RNF-05). */
@Entity({ name: 'transacciones_pedido' })
@Index('idx_transacciones_pedido_pedido', ['pedidoId'])
// Estas restricciones deberán materializarse en una migración explícita.
// numeric(12,2) excluye infinitos; el CHECK excluye NaN y montos no positivos.
@Check('ck_transacciones_pedido_monto_positivo', `"monto" > 0 AND "monto" <> 'NaN'::numeric`)
@Check('ck_transacciones_pedido_moneda_formato', `"moneda" ~ '^[A-Z]{3}$'`)
export class TransaccionPedido {
  /** Identificador local que servirá como Idempotency-Key al integrar la pasarela. */
  @PrimaryGeneratedColumn('uuid', { name: 'id' })
  id: string;

  @Column({ name: 'pedido_id', type: 'uuid' })
  pedidoId: string;

  @ManyToOne(() => Pedido, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'pedido_id', referencedColumnName: 'id' })
  pedido: Pedido;

  /** Importe del intento, conservado como texto decimal igual que Pedido.total. */
  @Column({ name: 'monto', type: 'numeric', precision: 12, scale: 2 })
  monto: string;

  @Column({ name: 'moneda', type: 'varchar', length: 3 })
  moneda: string;

  @Column({
    name: 'estado', type: 'enum', enum: EstadoTransaccionPedido,
    enumName: 'transaccion_pedido_estado', default: EstadoTransaccionPedido.PENDIENTE,
  })
  estado: EstadoTransaccionPedido;

  /** Referencia devuelta por la pasarela; puede faltar ante un error técnico. */
  @Column({ name: 'referencia_pasarela', type: 'varchar', length: 128, nullable: true })
  referenciaPasarela: string | null;

  /** Motivo de rechazo o diagnóstico técnico controlado, sin datos de pago sensibles. */
  @Column({ name: 'motivo', type: 'text', nullable: true })
  motivo: string | null;

  @CreateDateColumn({ name: 'creada_en', type: 'timestamptz' })
  creadaEn: Date;

  @UpdateDateColumn({ name: 'actualizada_en', type: 'timestamptz' })
  actualizadaEn: Date;
}
