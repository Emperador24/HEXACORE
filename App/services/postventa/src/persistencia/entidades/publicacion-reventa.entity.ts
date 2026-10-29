import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { transformadorMonto } from '../columnas';

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

  /**
   * Qué entrada se publica. Referencia por valor, sin llave foránea: la
   * `Entrada` vive en la base de Ventas desde ADR-14, y el ADR-01 ya advertía
   * que separar bases cuesta la integridad referencial del motor.
   *
   * Quien manda sobre el estado de la entrada es Ventas, no esta columna.
   */
  @Column({ name: 'entrada_id', type: 'uuid' })
  entradaId: string;

  /** Propietario que publica. Lo comprueba Ventas al marcar la entrada EN_REVENTA. */
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

  // ---------------------------------------------------------------------------
  // Copia de lo que se anuncia
  //
  // `precio_original` arriba ya se duplicaba desde la entrada por la razón que
  // explica su comentario. Estas tres columnas son lo mismo llevado hasta el
  // final: **un anuncio muestra lo que se anunció**.
  //
  // Sin ellas, listar el mercado exigiría leer `entradas`, que es de Ventas:
  // antes se hacía con un `innerJoin` en SQL, y eso ya no existe. Pedírselas a
  // Ventas por HTTP sería peor que copiarlas — una llamada por publicación
  // listada, y el mercado se caería cada vez que se cayera Ventas, justo lo que
  // ADR-14 separó estos servicios para evitar.
  //
  // Copiar es correcto aquí porque estos datos **no cambian** mientras la
  // publicación está activa: a qué evento pertenece la entrada, su número y su
  // localidad son fijos. Lo único que sí cambia —de quién es y en qué estado
  // está— no se copia: se consulta a Ventas, que es su dueño.
  // ---------------------------------------------------------------------------

  /** A qué evento pertenece la entrada publicada. */
  @Column({ name: 'evento_id', type: 'uuid' })
  eventoId: string;

  /** Número de ticket que se muestra en el anuncio. */
  @Column({ name: 'numero_ticket', type: 'varchar', length: 40 })
  numeroTicket: string;

  /** Localidad que se muestra en el anuncio ("Platea", "General"...). */
  @Column({ name: 'localidad_nombre', type: 'varchar', length: 120 })
  localidadNombre: string;

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
