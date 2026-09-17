import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { LARGO_CODIGO } from '../columnas';
import { Entrada } from './entrada.entity';

/** Por qué cambió de dueño la entrada. */
export enum MotivoCambioPropietario {
  /** Alta de la entrada en la venta primaria (CU-001). No tiene propietario anterior. */
  EMISION = 'EMISION',
  /** Compra en el mercado secundario (CU-006). Lleva transacción asociada. */
  REVENTA = 'REVENTA',
}

/**
 * Historial auditable de propietarios de cada entrada.
 *
 * **Esta tabla no existe en el modelo de datos del SAD §12**, y sin ella el
 * CU-006 no se puede cumplir: su post-condición 3 y su paso 11 exigen
 * *"registrar la transferencia en el historial de propietarios"*, su atributo
 * de Trazabilidad pide *"un historial auditable de todos los propietarios de
 * cada entrada"*, y RNF-11 lo cuantifica en *"100 %"* con *"retención ≥ 1
 * año"*. Con solo `Entrada.propietario_id` eso es imposible, porque cada
 * transferencia sobrescribe al dueño anterior y lo borra para siempre.
 *
 * Es **append-only**: hay un disparador en la base de datos que rechaza
 * cualquier UPDATE o DELETE sobre ella (ver la migración). Un historial que se
 * puede editar no es auditable, y dejarlo a la buena voluntad del código de
 * aplicación es confiar en que nadie escriba nunca un `save()` de más.
 *
 * Por eso la clave primaria es un `bigserial` y no un UUID: al ser una tabla
 * en la que solo se inserta, el orden de la clave es el orden real de los
 * hechos, y recorrer el historial de una entrada es leer sus filas ordenadas.
 */
@Entity({ name: 'historial_propietarios' })
@Index('idx_historial_entrada', ['entradaId', 'id'])
export class HistorialPropietario {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ name: 'entrada_id', type: 'uuid' })
  entradaId: string;

  @ManyToOne(() => Entrada, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'entrada_id' })
  entrada: Entrada;

  /** Nulo solo en la fila de EMISION: antes de comprarla, la entrada no tenía dueño. */
  @Column({ name: 'propietario_anterior_id', type: 'uuid', nullable: true })
  propietarioAnteriorId: string | null;

  @Column({ name: 'propietario_nuevo_id', type: 'uuid' })
  propietarioNuevoId: string;

  @Column({ name: 'motivo', type: 'enum', enum: MotivoCambioPropietario, enumName: 'motivo_cambio_propietario' })
  motivo: MotivoCambioPropietario;

  /**
   * Transacción que originó el cambio. Nula en las filas de EMISION (esas las
   * respalda el pago de CU-001, que vive en otro flujo).
   *
   * Es el *"id. de transacción"* que RNF-11 exige registrar. Se declara como
   * uuid suelto y no como relación para no crear una dependencia circular
   * entre las dos tablas de auditoría.
   */
  @Column({ name: 'transaccion_id', type: 'uuid', nullable: true })
  transaccionId: string | null;

  /**
   * Códigos QR antes y después del cambio.
   *
   * Aquí es donde sobrevive el código invalidado: en `entradas.codigo_qr` se
   * sobrescribe, pero queda constancia de cuál se revocó y cuándo. Es lo que
   * permite investigar después un intento de ingreso con un QR viejo, que es
   * justo el fraude que el atributo de Seguridad del CU-006 quiere impedir.
   */
  @Column({ name: 'codigo_qr_anterior', type: 'varchar', length: LARGO_CODIGO, nullable: true })
  codigoQrAnterior: string | null;

  @Column({ name: 'codigo_qr_nuevo', type: 'varchar', length: LARGO_CODIGO })
  codigoQrNuevo: string;

  /** La *"marca de tiempo"* de RNF-11. No se puede modificar: la tabla es de solo inserción. */
  @CreateDateColumn({ name: 'registrado_en', type: 'timestamptz' })
  registradoEn: Date;
}
