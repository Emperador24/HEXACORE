import { Column, Entity, Index, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import { transformadorMonto } from '../columnas';

/**
 * Localidad (zona de venta) de un evento: "General", "Palco VIP"… con su
 * precio y su aforo. Es lo que el paso 8 del CU-005 muestra como
 * *"localidades, precios y disponibilidad"*.
 *
 * Mezcla dos orígenes, y conviene tenerlo presente al sincronizar:
 *
 * - `nombre`, `precio`, `aforo` y `orden` son del organizador (CU-026, servicio
 *   de Eventos) y aquí solo se copian, igual que `eventos_referencia`.
 * - `vendidas` es **de este servicio**: lo incrementa la compra (CU-001). La
 *   sincronización con Eventos nunca debe pisarlo.
 *
 * La disponibilidad se guarda como contador y no se calcula contando filas de
 * `entradas`, por dos motivos (DECISIONES.md §12): la cartelera la lee en cada
 * consulta y debe responder rápido con un catálogo grande, y la compra
 * reserva cupo con un solo `UPDATE ... SET reservadas = reservadas + n` que el
 * `CHECK (vendidas + reservadas <= aforo)` de la migración impide pasar del
 * aforo (DECISIONES.md §13).
 */
@Entity({ name: 'localidades_evento' })
@Index('idx_localidades_evento', ['eventoId'])
export class LocalidadEvento {
  /**
   * Mismo identificador que `entradas.localidad_id`. Viene del servicio de
   * Eventos, así que aquí no se genera.
   */
  @PrimaryColumn({ name: 'localidad_id', type: 'uuid' })
  localidadId: string;

  /** Sin llave foránea, por el mismo motivo que `entradas.evento_id`: es una copia que puede ir por detrás. */
  @Column({ name: 'evento_id', type: 'uuid' })
  eventoId: string;

  @Column({ name: 'nombre', type: 'varchar', length: 120 })
  nombre: string;

  @Column({ name: 'precio', type: 'numeric', precision: 12, scale: 2, transformer: transformadorMonto })
  precio: number;

  @Column({ name: 'aforo', type: 'integer' })
  aforo: number;

  @Column({ name: 'vendidas', type: 'integer', default: 0 })
  vendidas: number;

  /**
   * Cupos apartados por compras aún sin pagar (CU-001). No están vendidos,
   * pero tampoco disponibles: la disponibilidad es `aforo - vendidas -
   * reservadas`. Al pagar pasan a `vendidas`; al vencer la reserva, se
   * devuelven.
   */
  @Column({ name: 'reservadas', type: 'integer', default: 0 })
  reservadas: number;

  /** Orden de presentación que fija el organizador (p. ej. de la más barata a la más cara). */
  @Column({ name: 'orden', type: 'smallint', default: 0 })
  orden: number;

  @UpdateDateColumn({ name: 'actualizada_en', type: 'timestamptz' })
  actualizadaEn: Date;
}

