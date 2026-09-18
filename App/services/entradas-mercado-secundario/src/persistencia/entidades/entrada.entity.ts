import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { LARGO_CODIGO, transformadorMonto } from '../columnas';

/**
 * Estados de una entrada.
 *
 * `VALIDA`, `EN_REVENTA` y `USADA` son los tres que ya usa el prototipo del
 * Portal Web Cliente (`core/models.ts`, enum `EstadoEntrada`), y se conservan
 * con el mismo nombre para que backend y frontend hablen igual.
 *
 * `ANULADA` se añade porque el camino de excepción **CU-006E** habla de una
 * entrada *"utilizada **o invalidada**"*: son dos situaciones distintas (se
 * escaneó en la puerta / se anuló por devolución o fraude) y ambas impiden
 * revender, así que necesitan estados separados.
 */
export enum EstadoEntrada {
  VALIDA = 'VALIDA',
  EN_REVENTA = 'EN_REVENTA',
  USADA = 'USADA',
  ANULADA = 'ANULADA',
}

/**
 * Boleta de un evento (SAD §12: `Entrada(id, evento_id, localidad_id,
 * propietario_id, codigoQR, estado)`).
 *
 * La tabla es de todo el servicio, no solo del CU-006: CU-001 (compra, Daniel)
 * escribe aquí y CU-002 (validación de QR) lee de aquí. El CU-006 nunca crea
 * entradas — solo cambia su propietario y su código QR.
 */
@Entity({ name: 'entradas' })
@Index('idx_entradas_propietario', ['propietarioId'])
@Index('idx_entradas_evento', ['eventoId'])
export class Entrada {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /**
   * Evento al que pertenece. Sin llave foránea física: el Evento vive en otro
   * microservicio y §12 lo dice explícitamente — *"las referencias entre
   * dominios se resuelven a nivel de aplicación mediante el identificador
   * correspondiente, y no con llaves foráneas físicas entre bases de datos
   * distintas"*. `eventos_referencia` es solo una caché que puede ir por
   * detrás, así que tampoco se apunta a ella con una FK.
   */
  @Column({ name: 'evento_id', type: 'uuid' })
  eventoId: string;

  @Column({ name: 'localidad_id', type: 'uuid' })
  localidadId: string;

  /**
   * Nombre de la localidad ("General", "Palco VIP") copiado en el momento de
   * la compra. Se guarda aquí a propósito: la boleta debe seguir diciendo qué
   * se vendió aunque el recinto renombre sus zonas después.
   */
  @Column({ name: 'localidad_nombre', type: 'varchar', length: 120 })
  localidadNombre: string;

  /**
   * Dueño actual. Cambia al completarse una reventa (post-condición 1 del
   * CU-006). El Usuario vive en `administracion`, así que tampoco lleva FK.
   */
  @Column({ name: 'propietario_id', type: 'uuid' })
  propietarioId: string;

  /**
   * Código que se presenta en el ingreso. Es **único en toda la tabla**, y esa
   * unicidad es lo que hace cumplible RNF-02 (*"códigos QR antiguos aceptados
   * en validación tras una transferencia: 0"*): al transferir la entrada se
   * sobrescribe con el nuevo código en el mismo UPDATE, de modo que el
   * anterior deja de existir y no puede coincidir con ninguna fila.
   *
   * Hacerlo en un solo UPDATE atómico es también lo que satisface la
   * post-condición 2 ("el QR anterior queda invalidado **antes** de emitir el
   * nuevo"): nunca hay un instante observable con los dos códigos vivos.
   *
   * El valor anterior no se pierde: queda registrado en `historial_propietarios`.
   */
  @Column({ name: 'codigo_qr', type: 'varchar', length: LARGO_CODIGO, unique: true })
  codigoQr: string;

  @Column({
    name: 'estado',
    type: 'enum',
    enum: EstadoEntrada,
    enumName: 'entrada_estado',
    default: EstadoEntrada.VALIDA,
  })
  estado: EstadoEntrada;

  /**
   * Lo que se pagó por la entrada en la venta primaria (CU-001).
   *
   * No es un dato decorativo: es la base sobre la que se aplica el tope de
   * precio de reventa (`REVENTA_TOPE_PRECIO_FACTOR`). Sin él no hay forma de
   * saber si un precio publicado es abusivo. No está en el §12 del SAD; ver
   * DECISIONES.md.
   */
  @Column({
    name: 'precio_original',
    type: 'numeric',
    precision: 12,
    scale: 2,
    transformer: transformadorMonto,
  })
  precioOriginal: number;

  /** Identificador legible de la boleta, para soporte y trazabilidad. */
  @Column({ name: 'numero_ticket', type: 'varchar', length: 32, unique: true })
  numeroTicket: string;

  @CreateDateColumn({ name: 'creada_en', type: 'timestamptz' })
  creadaEn: Date;

  @UpdateDateColumn({ name: 'actualizada_en', type: 'timestamptz' })
  actualizadaEn: Date;
}
