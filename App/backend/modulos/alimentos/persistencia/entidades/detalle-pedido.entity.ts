import { Check, Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Pedido } from './pedido.entity';
import { Producto } from './producto.entity';

/** Renglón de compra con los datos del menú acordados durante el checkout. */
@Entity({ name: 'detalles_pedido' })
@Index('uq_detalles_pedido_producto', ['pedidoId', 'productoId'], { unique: true })
@Index('idx_detalles_producto', ['productoId'])
@Check('ck_detalles_cantidad_positiva', '"cantidad" > 0')
@Check('ck_detalles_precio_positivo', `"precio_unitario" > 0 AND "precio_unitario" <> 'NaN'::numeric`)
export class DetallePedido {
  @PrimaryGeneratedColumn('uuid', { name: 'id' })
  id: string;

  @Column({ name: 'pedido_id', type: 'uuid' })
  pedidoId: string;

  @ManyToOne(() => Pedido, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'pedido_id', referencedColumnName: 'id' })
  pedido: Pedido;

  @Column({ name: 'producto_id', type: 'uuid' })
  productoId: string;

  @ManyToOne(() => Producto, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'producto_id', referencedColumnName: 'id' })
  producto: Producto;

  /** Copia histórica: no se obtiene del nombre vigente al consultar el pedido. */
  @Column({ name: 'nombre_producto', type: 'varchar', length: 200 })
  nombreProducto: string;

  /** Precio acordado por unidad, expresado en la moneda del pedido. */
  @Column({ name: 'precio_unitario', type: 'numeric', precision: 12, scale: 2 })
  precioUnitario: string;

  @Column({ name: 'cantidad', type: 'integer' })
  cantidad: number;
}
