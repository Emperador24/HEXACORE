import { Column, CreateDateColumn, Entity, JoinColumn, OneToOne, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import { Pedido } from './pedido.entity';

export enum EstadoReservaInventario {
  PREPARANDO = 'PREPARANDO',
  ACTIVA = 'ACTIVA',
  LIBERACION_PENDIENTE = 'LIBERACION_PENDIENTE',
  LIBERADA = 'LIBERADA',
  CONSUMO_PENDIENTE = 'CONSUMO_PENDIENTE',
  CONSUMIDA = 'CONSUMIDA',
}

/** Registro técnico para la futura coordinación PostgreSQL/Redis. No duplica detalles ni vencimiento. */
@Entity({ name: 'reservas_inventario' })
export class ReservaInventario {
  @PrimaryColumn({ name: 'pedido_id', type: 'uuid' })
  pedidoId: string;

  @OneToOne(() => Pedido, { nullable: false, onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'pedido_id', referencedColumnName: 'id', foreignKeyConstraintName: 'fk_reservas_inventario_pedido' })
  pedido: Pedido;

  @Column({ name: 'estado', type: 'enum', enum: EstadoReservaInventario,
    enumName: 'reserva_inventario_estado', default: EstadoReservaInventario.PREPARANDO })
  estado: EstadoReservaInventario;

  @CreateDateColumn({ name: 'creada_en', type: 'timestamptz' })
  creadaEn: Date;

  @UpdateDateColumn({ name: 'actualizada_en', type: 'timestamptz' })
  actualizadaEn: Date;
}
