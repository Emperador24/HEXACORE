import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

/**
 * Estado de un QR visto desde la puerta. `USADA` es el único que pone este
 * servicio; los demás llegan de Ventas por eventos.
 */
export enum EstadoQr {
  VALIDA = 'VALIDA',
  EN_REVENTA = 'EN_REVENTA',
  USADA = 'USADA',
  ANULADA = 'ANULADA',
}

/** Copia local del QR de una entrada (ADR-15). Ver la migración `QrEntradas`. */
@Entity({ name: 'qr_entradas' })
export class QrEntrada {
  @PrimaryColumn({ name: 'entrada_id', type: 'uuid' })
  entradaId: string;

  @Column({ name: 'evento_id', type: 'uuid' })
  eventoId: string;

  @Column({ name: 'hash_qr', type: 'char', length: 64 })
  hashQr: string;

  @Column({ name: 'numero_ticket', type: 'varchar', length: 32 })
  numeroTicket: string;

  @Column({ name: 'localidad_nombre', type: 'varchar', length: 120 })
  localidadNombre: string;

  @Column({ name: 'estado', type: 'varchar', length: 12 })
  estado: EstadoQr;

  @Column({ name: 'secuencia', type: 'bigint' })
  secuencia: string;

  @UpdateDateColumn({ name: 'actualizado_en', type: 'timestamptz' })
  actualizadoEn: Date;
}
