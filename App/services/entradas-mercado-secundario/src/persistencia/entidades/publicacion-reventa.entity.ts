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

/**
 * Estados de una publicación en el mercado secundario.
 *
 * Nótese que **no existe un estado `EN_CHECKOUT`**, y es deliberado. El
 * bloqueo mientras un comprador paga (paso 6 del CU-006) vive **solo en
 * Redis** (ADR-03), no aquí.
 *
 * Si el bloqueo se reflejara además como estado en esta tabla, un proceso que
 * muriera en mitad del pago dejaría la fila en `EN_CHECKOUT` para siempre: la
 * publicación quedaría congelada sin que nadie pueda comprarla ni retirarla, y
 * haría falta un trabajo de limpieza para repararla. El TTL de Redis se cura
 * solo; una columna en Postgres no.
 *
 * Es exactamente el razonamiento del ADR-03 al descartar *"bloqueo pesimista
 * directamente en la base de datos relacional"*.
 */
export enum EstadoPublicacion {
  /** Visible en el mercado y comprable. */
  ACTIVA = 'ACTIVA',
  /** Se completó la transferencia (pasos 9-11). */
  VENDIDA = 'VENDIDA',
  /** El vendedor la quitó del mercado — flujo alterno CU-006B. */
  RETIRADA = 'RETIRADA',
  /** Llegó su fecha de expiración sin venderse — flujo alterno CU-006D. */
  EXPIRADA = 'EXPIRADA',
}

/**
 * Oferta de una entrada ya adquirida, puesta en venta por su propietario
 * (SAD §12: `PublicacionReventa(id, entrada_id, vendedor_id, precio, estado)`,
 * y §4: *"Oferta de una entrada ya adquirida, puesta en venta por su
 * propietario en el mercado secundario"*).
 *
 * Los campos `fecha_expiracion`, `comprador_id` y `precio_original` no están
 * en §12; ver DECISIONES.md para por qué hacen falta.
 */
@Entity({ name: 'publicaciones_reventa' })
@Index('idx_publicaciones_estado', ['estado'])
@Index('idx_publicaciones_vendedor', ['vendedorId'])
// Índice del listado del mercado (paso 5 del CU-006): filtra por estado y
// ordena por fecha. Parcial, porque una publicación vendida o retirada nunca
// se lista y no tiene por qué ocupar el índice.
@Index('idx_publicaciones_mercado', ['estado', 'fechaPublicacion'], {
  where: `estado = 'ACTIVA'`,
})
export class PublicacionReventa {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'entrada_id', type: 'uuid' })
  entradaId: string;

  /** Llave foránea real: la Entrada vive en esta misma base (mismo dominio). */
  @ManyToOne(() => Entrada, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'entrada_id' })
  entrada: Entrada;

  /** Propietario que publica. Debe coincidir con `entrada.propietarioId` al publicar (pre-condición 1). */
  @Column({ name: 'vendedor_id', type: 'uuid' })
  vendedorId: string;

  /** Precio pedido. Puede cambiar mientras la publicación siga ACTIVA — flujo alterno CU-006A. */
  @Column({ name: 'precio', type: 'numeric', precision: 12, scale: 2, transformer: transformadorMonto })
  precio: number;

  /**
   * Copia del precio original de la entrada en el momento de publicar.
   *
   * Se duplica desde `entradas.precio_original` a propósito: es la referencia
   * contra la que se validó el tope, y dejarla aquí permite auditar después
   * *por qué* se aceptó este precio, aunque la entrada cambie.
   */
  @Column({
    name: 'precio_original',
    type: 'numeric',
    precision: 12,
    scale: 2,
    transformer: transformadorMonto,
  })
  precioOriginal: number;

  @Column({
    name: 'estado',
    type: 'enum',
    enum: EstadoPublicacion,
    enumName: 'publicacion_estado',
    default: EstadoPublicacion.ACTIVA,
  })
  estado: EstadoPublicacion;

  /** Quién la compró. Nulo mientras no se haya vendido. */
  @Column({ name: 'comprador_id', type: 'uuid', nullable: true })
  compradorId: string | null;

  @Column({ name: 'fecha_publicacion', type: 'timestamptz', default: () => 'now()' })
  fechaPublicacion: Date;

  /**
   * Momento a partir del cual deja de poder venderse (CU-006D). Se calcula al
   * publicar como `evento.fechaInicio - REVENTA_MARGEN_CIERRE_MINUTOS`.
   *
   * Se persiste en vez de calcularse al vuelo para que el listado del mercado
   * pueda filtrar por ella con un índice, y para que quede constancia de qué
   * plazo se aplicó aunque la política cambie después.
   */
  @Column({ name: 'fecha_expiracion', type: 'timestamptz' })
  fechaExpiracion: Date;

  /** Cuándo dejó de estar ACTIVA (vendida, retirada o expirada). Nulo mientras siga activa. */
  @Column({ name: 'fecha_cierre', type: 'timestamptz', nullable: true })
  fechaCierre: Date | null;

  @CreateDateColumn({ name: 'creada_en', type: 'timestamptz' })
  creadaEn: Date;

  @UpdateDateColumn({ name: 'actualizada_en', type: 'timestamptz' })
  actualizadaEn: Date;
}
