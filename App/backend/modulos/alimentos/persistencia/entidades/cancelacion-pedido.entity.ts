import { Column, Entity, PrimaryColumn } from 'typeorm';

export type EstadoReembolsoPedido = 'PENDIENTE' | 'APROBADO' | 'RECHAZADO' | 'INCIERTO';
export type PoliticaInventarioCancelacion = 'RESTITUIR_SIN_PREPARAR' | 'NO_REINCORPORAR' | 'REVISION';

/** Una cancelación por pedido. El cobro original nunca se modifica. */
@Entity({ name: 'cancelaciones_pedido' })
export class CancelacionPedido {
  @PrimaryColumn('uuid', { name: 'pedido_id' }) pedidoId: string;
  @Column({ name: 'operacion_id', type: 'uuid', unique: true }) operacionId: string;
  @Column({ name: 'establecimiento_id', type: 'uuid' }) establecimientoId: string;
  @Column({ name: 'actor_id', type: 'uuid' }) actorId: string;
  @Column({ type: 'varchar', length: 200 }) motivo: string;
  @Column({ name: 'cancelado_en', type: 'timestamptz' }) canceladoEn: Date;
  @Column({ type: 'char', length: 64 }) huella: string;
  @Column({ name: 'cobro_id', type: 'uuid' }) cobroId: string;
  @Column({ name: 'referencia_cobro', type: 'varchar', length: 128 }) referenciaCobro: string;
  @Column({ type: 'numeric', precision: 12, scale: 2 }) monto: string;
  @Column({ type: 'varchar', length: 3 }) moneda: string;
  @Column({ name: 'reembolso_id', type: 'uuid', unique: true }) reembolsoId: string;
  @Column({ name: 'estado_reembolso', type: 'varchar', length: 12 }) estadoReembolso: EstadoReembolsoPedido;
  @Column({ name: 'intentado_en', type: 'timestamptz', nullable: true }) intentadoEn: Date | null;
  @Column({ name: 'resuelto_en', type: 'timestamptz', nullable: true }) resueltoEn: Date | null;
  @Column({ name: 'referencia_reembolso', type: 'varchar', length: 128, nullable: true }) referenciaReembolso: string | null;
  @Column({ name: 'politica_inventario', type: 'varchar', length: 32 }) politicaInventario: PoliticaInventarioCancelacion;
  @Column({ name: 'estado_inventario', type: 'varchar', length: 20 }) estadoInventario: 'PENDIENTE' | 'RESTITUIDO' | 'NO_REINCORPORAR' | 'REVISION';
  @Column({ name: 'operaciones_inventario', type: 'jsonb' }) operacionesInventario: string[];
}

export function cancelacionDto(c: CancelacionPedido) {
  return { operacionId: c.operacionId, pedidoId: c.pedidoId, motivo: c.motivo,
    canceladoEn: c.canceladoEn.toISOString(), reembolso: { estado: c.estadoReembolso,
      monto: c.monto, moneda: c.moneda, referencia: c.referenciaReembolso,
      resueltoEn: c.resueltoEn?.toISOString() ?? null },
    inventario: c.estadoInventario };
}
