import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'entregas_pedido' })
export class EntregaPedido {
  @PrimaryColumn('uuid', { name: 'pedido_id' }) pedidoId: string;
  @Column({ name: 'operacion_id', type: 'uuid', unique: true }) operacionId: string;
  @Column({ name: 'establecimiento_id', type: 'uuid' }) establecimientoId: string;
  @Column({ name: 'actor_id', type: 'uuid' }) actorId: string;
  @Column({ name: 'punto_entrega', type: 'text' }) puntoEntrega: string;
  @Column({ name: 'entregado_en', type: 'timestamptz' }) entregadoEn: Date;
  @Column({ name: 'qr_huella', type: 'char', length: 64 }) qrHuella: string;
}

export function entregaDto(e: EntregaPedido) {
  return { operacionId: e.operacionId, entregadoEn: e.entregadoEn.toISOString(), puntoEntrega: e.puntoEntrega };
}
