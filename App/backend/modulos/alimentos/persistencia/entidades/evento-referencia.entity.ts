import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

/** Referencia histórica para conservar FK. CU-015 valida y consulta la disponibilidad
 * por ConsultaEventos del módulo Eventos/Recintos; esta fila no es autoridad. */
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
