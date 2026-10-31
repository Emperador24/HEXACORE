import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { transformadorMonto } from '../columnas';

/**
 * Estados de una compra (CU-001).
 *
 * ```
 *              pagar                 aprobado
 * PENDIENTE ─────────► PAGANDO ─────────────────► PAGADA ──► CANCELADA / PARCIALMENTE_CANCELADA (CU-003)
 *   │  ▲                  │
 *   │  └──── rechazado ───┘  (CU-001C: la reserva sigue viva, se puede reintentar)
 *   │
 *   └── vence el plazo ──► EXPIRADA  (CU-001B: se liberan cupo y cupón)
 * ```
 *
 * `PAGANDO` existe para que el barrido de reservas vencidas no libere el cupo
 * **mientras un cobro está en vuelo**: si lo hiciera y el cobro se aprobara,
 * habría una persona pagando por entradas que ya se vendieron a otra. Si la
 * pasarela no responde, la compra se queda en `PAGANDO` y requiere conciliación.
 */
export enum EstadoCompra {
  PENDIENTE = 'PENDIENTE',
  PAGANDO = 'PAGANDO',
  PAGADA = 'PAGADA',
  EXPIRADA = 'EXPIRADA',
  CANCELADA = 'CANCELADA',
  PARCIALMENTE_CANCELADA = 'PARCIALMENTE_CANCELADA',
}

/**
 * Compra en la venta primaria (CU-001): una localidad, una cantidad, un pago.
 *
 * Nace como **reserva**: al crearla se aparta el cupo en `localidades_evento`
 * y se le da un plazo para pagar (`expiraEn`). Así el cliente no paga por
 * entradas que, cuando termina de escribir la tarjeta, ya no existen.
 */
@Entity({ name: 'compras' })
@Index('idx_compras_comprador', ['compradorId'])
export class Compra {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Identificador legible (`CMP-2026-000001`) para soporte y para el correo de confirmación. */
  @Column({ name: 'numero_compra', type: 'varchar', length: 32, unique: true })
  numeroCompra: string;

  @Column({ name: 'comprador_id', type: 'uuid' })
  compradorId: string;

  @Column({ name: 'evento_id', type: 'uuid' })
  eventoId: string;

  @Column({ name: 'localidad_id', type: 'uuid' })
  localidadId: string;

  @Column({ name: 'cantidad', type: 'integer' })
  cantidad: number;

  /** Precio de la localidad en el momento de reservar: si el organizador lo cambia después, esta compra no cambia. */
  @Column({ name: 'precio_unitario', type: 'numeric', precision: 12, scale: 2, transformer: transformadorMonto })
  precioUnitario: number;

  @Column({ name: 'subtotal', type: 'numeric', precision: 12, scale: 2, transformer: transformadorMonto })
  subtotal: number;

  /** Descuento del código promocional (CU-004). 0 si no hay. */
  @Column({ name: 'descuento', type: 'numeric', precision: 12, scale: 2, default: 0, transformer: transformadorMonto })
  descuento: number;

  @Column({ name: 'total', type: 'numeric', precision: 12, scale: 2, transformer: transformadorMonto })
  total: number;

  @Column({ name: 'codigo_promocional', type: 'varchar', length: 40, nullable: true })
  codigoPromocional: string | null;

  @Column({ name: 'estado', type: 'enum', enum: EstadoCompra, enumName: 'compra_estado', default: EstadoCompra.PENDIENTE })
  estado: EstadoCompra;

  /**
   * Cuántos cobros **rechazados** lleva. Forma parte de la clave de
   * idempotencia del siguiente intento: con la misma clave, la pasarela
   * devolvería el rechazo anterior en vez de probar la nueva tarjeta (CU-001C).
   * Un cobro sin respuesta NO lo incrementa, para que reintentarlo sea seguro.
   */
  @Column({ name: 'intentos_rechazados', type: 'integer', default: 0 })
  intentosRechazados: number;

  @Column({ name: 'referencia_pasarela', type: 'varchar', length: 128, nullable: true })
  referenciaPasarela: string | null;

  /** Último motivo de rechazo o de fallo, para mostrarlo y para auditar. */
  @Column({ name: 'motivo', type: 'text', nullable: true })
  motivo: string | null;

  /** Hasta cuándo se mantiene la reserva sin pagar (CU-001B). */
  @Column({ name: 'expira_en', type: 'timestamptz' })
  expiraEn: Date;

  @Column({ name: 'pagada_en', type: 'timestamptz', nullable: true })
  pagadaEn: Date | null;

  @CreateDateColumn({ name: 'creada_en', type: 'timestamptz' })
  creadaEn: Date;

  @UpdateDateColumn({ name: 'actualizada_en', type: 'timestamptz' })
  actualizadaEn: Date;
}
