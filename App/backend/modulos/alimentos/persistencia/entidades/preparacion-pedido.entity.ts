import { Column, Entity, PrimaryColumn } from 'typeorm';

export type EstadoPreparacion = 'RECIBIDO' | 'EN_PREPARACION' | 'LISTO_PARA_ENTREGAR';
@Entity({ name: 'preparaciones_pedido' })
export class PreparacionPedido {
  @PrimaryColumn('uuid', { name: 'pedido_id' }) pedidoId: string;
  @Column({ type: 'varchar', length: 24, default: 'RECIBIDO' }) estado: EstadoPreparacion;
  @Column({ type: 'integer', default: 0 }) version: number;
  @Column({ name: 'iniciado_en', type: 'timestamptz', nullable: true }) iniciadoEn: Date | null;
  @Column({ name: 'estimado_listo_en', type: 'timestamptz', nullable: true }) estimadoListoEn: Date | null;
  @Column({ name: 'listo_en', type: 'timestamptz', nullable: true }) listoEn: Date | null;
}

@Entity({ name: 'historial_preparacion' })
export class HistorialPreparacion {
  @PrimaryColumn('uuid') id: string;
  @Column({ name: 'pedido_id', type: 'uuid' }) pedidoId: string;
  @Column({ name: 'actor_id', type: 'uuid' }) actorId: string;
  @Column({ type: 'varchar', length: 30 }) accion: string;
  @Column({ type: 'char', length: 64 }) huella: string;
  @Column({ name: 'version_anterior', type: 'integer' }) versionAnterior: number;
  @Column({ name: 'version_nueva', type: 'integer' }) versionNueva: number;
  @Column({ type: 'jsonb' }) datos: object;
  @Column({ type: 'jsonb' }) resultado: Record<string, unknown>;
  @Column({ type: 'text' }) aviso: string;
  @Column({ name: 'creado_en', type: 'timestamptz' }) creadoEn: Date;
}

@Entity({ name: 'incidencias_preparacion' })
export class IncidenciaPreparacion {
  @PrimaryColumn('uuid') id: string;
  @Column({ name: 'pedido_id', type: 'uuid' }) pedidoId: string;
  @Column({ name: 'producto_id', type: 'uuid', nullable: true }) productoId: string | null;
  @Column({ type: 'text' }) descripcion: string;
  @Column({ name: 'actor_id', type: 'uuid' }) actorId: string;
  @Column({ name: 'creada_en', type: 'timestamptz' }) creadaEn: Date;
  @Column({ name: 'resuelta_en', type: 'timestamptz', nullable: true }) resueltaEn: Date | null;
  @Column({ name: 'resuelta_por', type: 'uuid', nullable: true }) resueltaPor: string | null;
  @Column({ type: 'text', nullable: true }) resolucion: string | null;
}
