import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

/**
 * Proyección local mínima del evento seleccionado en CU-011.
 *
 * El evento pertenece a `eventos-emergencias`: aquí se conserva su identidad
 * y la disponibilidad necesaria para la primera precondición del caso de uso,
 * sin relaciones ni consultas a la base de datos de otro servicio (ADR-01).
 * La carga y sincronización de esta proyección se implementarán por separado.
 */
@Entity({ name: 'eventos_referencia' })
export class EventoReferencia {
  /** Identificador del servicio de Eventos; no se genera en Pedidos. */
  @PrimaryColumn({ name: 'evento_id', type: 'uuid' })
  eventoId: string;

  /** Nombre para identificar el evento seleccionado en el flujo de compra. */
  @Column({ name: 'nombre', type: 'varchar', length: 200 })
  nombre: string;

  /** Disponibilidad del evento para CU-011, independiente de la del establecimiento. */
  @Column({ name: 'disponible', type: 'boolean', default: false })
  disponible: boolean;

  /** Última actualización local; no representa la fecha del evento de origen. */
  @UpdateDateColumn({ name: 'actualizado_en', type: 'timestamptz' })
  actualizadoEn: Date;
}
