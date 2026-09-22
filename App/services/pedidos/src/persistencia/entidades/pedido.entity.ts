import {
  Check, Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne,
  PrimaryGeneratedColumn, UpdateDateColumn,
} from 'typeorm';
import { Establecimiento } from './establecimiento.entity';

/** Estados del checkout de CU-011; preparación y entrega pertenecen a otros CU. */
export enum EstadoPedido {
  PENDIENTE_PAGO = 'PENDIENTE_PAGO',
  CONFIRMADO = 'CONFIRMADO',
  EXPIRADO = 'EXPIRADO',
  CANCELADO = 'CANCELADO',
}

@Entity({ name: 'pedidos' })
@Index('idx_pedidos_cliente', ['clienteId'])
@Index('idx_pedidos_establecimiento_estado', ['establecimientoId', 'estado'])
// Estas restricciones deberán materializarse en una migración explícita.
@Check('ck_pedidos_total_positivo', `"total" > 0 AND "total" <> 'NaN'::numeric`)
@Check('ck_pedidos_moneda_formato', `"moneda" ~ '^[A-Z]{3}$'`)
@Check('ck_pedidos_expiracion_posterior', '"expira_en" > "creado_en"')
export class Pedido {
  @PrimaryGeneratedColumn('uuid', { name: 'id' })
  id: string;

  /** Identidad autenticada de Administración; sin FK entre bases de servicios. */
  @Column({ name: 'cliente_id', type: 'uuid' })
  clienteId: string;

  @Column({ name: 'establecimiento_id', type: 'uuid' })
  establecimientoId: string;

  @ManyToOne(() => Establecimiento, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'establecimiento_id', referencedColumnName: 'id' })
  establecimiento: Establecimiento;

  /** Un pago rechazado permite reintentar: no es un estado terminal del pedido. */
  @Column({
    name: 'estado', type: 'enum', enum: EstadoPedido, enumName: 'pedido_estado',
    default: EstadoPedido.PENDIENTE_PAGO,
  })
  estado: EstadoPedido;

  /** Importe acordado, conservado como texto decimal igual que Producto.precio. */
  @Column({ name: 'total', type: 'numeric', precision: 12, scale: 2 })
  total: string;

  @Column({ name: 'moneda', type: 'varchar', length: 3 })
  moneda: string;

  /** CU-011 exige seleccionar un método, pero no enumera las modalidades admitidas. */
  @Column({ name: 'metodo_entrega', type: 'varchar', length: 80 })
  metodoEntrega: string;

  /** Límite del checkout (CU-011D); se conserva también tras finalizarlo. */
  @Column({ name: 'expira_en', type: 'timestamptz' })
  expiraEn: Date;

  /** Se asignará al emitir el QR; confirmar y generar el QR son pasos distintos. */
  @Column({ name: 'codigo_qr', type: 'varchar', length: 64, nullable: true, unique: true })
  codigoQr: string | null;

  @Column({ name: 'motivo_cancelacion', type: 'text', nullable: true })
  motivoCancelacion: string | null;

  @Column({ name: 'confirmado_en', type: 'timestamptz', nullable: true })
  confirmadoEn: Date | null;

  @Column({ name: 'cancelado_en', type: 'timestamptz', nullable: true })
  canceladoEn: Date | null;

  @CreateDateColumn({ name: 'creado_en', type: 'timestamptz' })
  creadoEn: Date;

  @UpdateDateColumn({ name: 'actualizado_en', type: 'timestamptz' })
  actualizadoEn: Date;
}
