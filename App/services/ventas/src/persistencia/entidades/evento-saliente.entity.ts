import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Un evento esperando a salir al broker: la bandeja de salida (Transactional
 * Outbox, ADR-15).
 *
 * Se escribe **en la misma transacción** que el cambio que describe. Así no
 * puede haber una entrada emitida sin su `CompraConfirmada`, ni un evento
 * publicado de una transacción que luego se deshizo. Lo saca al broker
 * `BandejaSalida`, después del commit.
 */
@Entity({ name: 'eventos_salientes' })
export class EventoSaliente {
  /**
   * Orden de escritura. Va también dentro del mensaje: dos cambios de la misma
   * entrada se escriben en orden —el segundo espera el bloqueo de fila del
   * primero—, así que quien consume puede descartar uno viejo que llegue tarde.
   */
  @PrimaryGeneratedColumn({ name: 'secuencia', type: 'bigint' })
  secuencia: string;

  @Column({ name: 'exchange', type: 'varchar', length: 80 })
  exchange: string;

  @Column({ name: 'clave', type: 'varchar', length: 80 })
  clave: string;

  @Column({ name: 'cuerpo', type: 'jsonb' })
  cuerpo: Record<string, unknown>;

  @CreateDateColumn({ name: 'creado_en', type: 'timestamptz' })
  creadoEn: Date;

  @Column({ name: 'publicado_en', type: 'timestamptz', nullable: true })
  publicadoEn: Date | null;
}
