import { Check, Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Establecimiento } from './establecimiento.entity';

/** Producto del menú con las existencias necesarias para el checkout de CU-011. */
@Entity({ name: 'productos' })
@Index('idx_productos_establecimiento', ['establecimientoId'])
// La futura migración debe crear estos CHECK; synchronize permanece desactivado.
@Check('ck_productos_precio_positivo', `"precio" > 0 AND "precio" <> 'NaN'::numeric`)
@Check('ck_productos_inventario_no_negativo', '"cantidad_inventario" >= 0')
export class Producto {
  @PrimaryGeneratedColumn('uuid', { name: 'id' })
  id: string;

  @Column({ name: 'establecimiento_id', type: 'uuid' })
  establecimientoId: string;

  @ManyToOne(() => Establecimiento, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'establecimiento_id', referencedColumnName: 'id' })
  establecimiento: Establecimiento;

  @Column({ name: 'nombre', type: 'varchar', length: 200 })
  nombre: string;

  @Column({ name: 'descripcion', type: 'text', nullable: true })
  descripcion: string | null;

  /** PostgreSQL devuelve numeric como texto; se conserva sin conversión a coma flotante. */
  @Column({ name: 'precio', type: 'numeric', precision: 12, scale: 2 })
  precio: string;

  /** Habilitación del producto en el menú, independiente de sus existencias. */
  @Column({ name: 'activo', type: 'boolean', default: false })
  activo: boolean;

  /** Existencias físicas; las reservas y el descuento concurrente se implementarán después. */
  @Column({ name: 'cantidad_inventario', type: 'integer', default: 0 })
  cantidadInventario: number;
}
