import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { transformadorMonto } from '../columnas';
import { Entrada } from './entrada.entity';
import { PublicacionReventa } from './publicacion-reventa.entity';

/**
 * Resultado del cobro contra la pasarela.
 *
 * `RECHAZADA` y `FALLIDA` son distintas y hay que poder distinguirlas:
 * - **RECHAZADA** (CU-006G) — la pasarela respondió y dijo que no. Se sabe con
 *   certeza que no hubo cobro.
 * - **FALLIDA** (CU-006I) — no hubo respuesta: *timeout*, error de red, la
 *   pasarela caída. **No se sabe si se cobró o no**, y por eso el SAD §13 pide
 *   para este riesgo una *"cola de reconciliación de pagos"* y *"marcar la
 *   transacción como pendiente y permitir reintento manual"*. Colapsar los dos
 *   casos en uno haría imposible saber qué hay que reconciliar.
 */
export enum EstadoTransaccion {
  /** Creada antes de llamar a la pasarela; es el registro de que se intentó. */
  PENDIENTE = 'PENDIENTE',
  APROBADA = 'APROBADA',
  /** La pasarela rechazó el cobro — CU-006G. */
  RECHAZADA = 'RECHAZADA',
  /** No se obtuvo respuesta de la pasarela — CU-006I. Requiere reconciliación. */
  FALLIDA = 'FALLIDA',
  /** El comprador abandonó antes de pagar — flujo alterno CU-006C. */
  CANCELADA = 'CANCELADA',
}

/**
 * Movimiento económico de un intento de compra en el mercado secundario.
 *
 * Esta tabla no está en el §12 del SAD; ver DECISIONES.md. Existe porque el
 * paso 13 del CU-006 ("Liquidar el pago correspondiente al vendedor") necesita
 * tres cifras —lo que paga el comprador, lo que retiene la plataforma y lo que
 * recibe el vendedor— y porque RNF-11 exige registrar *"actor, marca de
 * tiempo, id. de transacción y resultado"* del 100 % de las operaciones
 * financieras, incluidas **las que fallan**. Por eso se crea la fila antes de
 * llamar a la pasarela y no después de que apruebe.
 *
 * Está separada de `historial_propietarios` porque responde a otra pregunta:
 * el historial dice *quién tuvo la entrada*; esta dice *cuánto dinero se movió
 * y con qué referencia en la pasarela*.
 */
@Entity({ name: 'transacciones_reventa' })
@Index('idx_transacciones_publicacion', ['publicacionId'])
@Index('idx_transacciones_comprador', ['compradorId'])
@Index('idx_transacciones_estado', ['estado'])
export class TransaccionReventa {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'publicacion_id', type: 'uuid' })
  publicacionId: string;

  @ManyToOne(() => PublicacionReventa, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'publicacion_id' })
  publicacion: PublicacionReventa;

  /** Se duplica desde la publicación para poder consultar el histórico de una entrada sin un JOIN. */
  @Column({ name: 'entrada_id', type: 'uuid' })
  entradaId: string;

  @ManyToOne(() => Entrada, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'entrada_id' })
  entrada: Entrada;

  @Column({ name: 'comprador_id', type: 'uuid' })
  compradorId: string;

  @Column({ name: 'vendedor_id', type: 'uuid' })
  vendedorId: string;

  /** Lo que paga el comprador: exactamente el precio publicado, sin recargos. */
  @Column({ name: 'precio', type: 'numeric', precision: 12, scale: 2, transformer: transformadorMonto })
  precio: number;

  /** Lo que retiene la plataforma (`REVENTA_COMISION_PORCENTAJE`). */
  @Column({ name: 'comision', type: 'numeric', precision: 12, scale: 2, transformer: transformadorMonto })
  comision: number;

  /** Lo que se le liquida al vendedor en el paso 13. Invariante en la BD: `precio = comision + neto_vendedor`. */
  @Column({
    name: 'neto_vendedor',
    type: 'numeric',
    precision: 12,
    scale: 2,
    transformer: transformadorMonto,
  })
  netoVendedor: number;

  @Column({
    name: 'estado',
    type: 'enum',
    enum: EstadoTransaccion,
    enumName: 'transaccion_estado',
    default: EstadoTransaccion.PENDIENTE,
  })
  estado: EstadoTransaccion;

  /**
   * Identificador opaco que devuelve la pasarela.
   *
   * Es lo **único** que se guarda del cobro. RNF-05 es tajante: *"campos de
   * tarjeta persistidos en cualquier base de datos propia: 0"*, y *"el cobro
   * se delega íntegramente a la pasarela"*. Aquí no hay ni PAN, ni CVV, ni
   * fecha de expiración, ni un token reutilizable.
   */
  @Column({ name: 'referencia_pasarela', type: 'varchar', length: 128, nullable: true })
  referenciaPasarela: string | null;

  /** Texto devuelto por la pasarela al rechazar, o la causa del fallo. Es el "resultado" que pide RNF-11. */
  @Column({ name: 'motivo', type: 'text', nullable: true })
  motivo: string | null;

  /** Identificador legible del cobro, para conciliar con el extracto. */
  @Column({ name: 'numero_transaccion', type: 'varchar', length: 32, unique: true })
  numeroTransaccion: string;

  @CreateDateColumn({ name: 'creada_en', type: 'timestamptz' })
  creadaEn: Date;

  @UpdateDateColumn({ name: 'actualizada_en', type: 'timestamptz' })
  actualizadaEn: Date;
}
