import { Column, CreateDateColumn, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import { ResultadoCobro } from '../../pagos/procesador-pagos';

export enum TipoOperacion {
  COBRO = 'COBRO',
  REEMBOLSO = 'REEMBOLSO',
}

/**
 * Libro de idempotencia de Pagos.
 *
 * Es lo que ADR-14 pedía y no existía: las llaves ya se mandaban a la pasarela,
 * pero **ningún lado guardaba el resultado**. Si el servicio se reiniciaba
 * entre el cobro y la respuesta, el reintento volvía a preguntarle a la
 * pasarela y dependía de que ella recordara. Ahora el primer resultado terminal
 * queda escrito aquí.
 *
 * La clave de idempotencia es la **llave primaria**: no hay forma de insertar
 * dos filas para la misma operación, y esa garantía la da PostgreSQL, no el
 * código.
 */
@Entity({ name: 'transacciones_pago' })
export class TransaccionPago {
  /**
   * La clave que manda el llamante. Es el id de su propia transacción, así que
   * dos servicios distintos no pueden chocar: cada uno genera UUID.
   */
  @PrimaryColumn({ name: 'clave_idempotencia', type: 'varchar', length: 128 })
  claveIdempotencia: string;

  @Column({ name: 'tipo', type: 'enum', enum: TipoOperacion, enumName: 'tipo_operacion_pago' })
  tipo: TipoOperacion;

  /**
   * Quién pidió la operación: `entradas`, `alimentos`…
   *
   * No se usa para autorizar —eso lo hace el token—, sino para auditar
   * (RNF-11) y para poder responder "¿qué cobros hizo este servicio?" sin
   * cruzar bases ajenas.
   */
  @Column({ name: 'solicitante', type: 'varchar', length: 60 })
  solicitante: string;

  @Column({ name: 'monto', type: 'numeric', precision: 12, scale: 2 })
  monto: string;

  @Column({ name: 'moneda', type: 'varchar', length: 3 })
  moneda: string;

  @Column({ name: 'resultado', type: 'enum', enum: ResultadoCobro, enumName: 'resultado_cobro' })
  resultado: ResultadoCobro;

  /** Identificador del cobro en la pasarela. Nulo si no llegó a haberlo. */
  @Column({ name: 'referencia', type: 'varchar', length: 128, nullable: true })
  referencia: string | null;

  @Column({ name: 'motivo', type: 'varchar', length: 120, nullable: true })
  motivo: string | null;

  /**
   * Cuántas veces se ha preguntado por esta clave.
   *
   * Un contador alto con resultado INDETERMINADO es exactamente la fila que hay
   * que mirar a mano: la cola de reconciliación que pide el SAD §13.
   */
  @Column({ name: 'intentos', type: 'integer', default: 1 })
  intentos: number;

  @CreateDateColumn({ name: 'creada_en', type: 'timestamptz' })
  creadaEn: Date;

  @UpdateDateColumn({ name: 'actualizada_en', type: 'timestamptz' })
  actualizadaEn: Date;
}
