import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Mensaje esperando a salir al broker: la bandeja de salida (Transactional
 * Outbox, ADR-15), igual que en Ventas. Se escribe en la misma transacción que
 * el cambio del evento; `BandejaEventos` lo publica después del commit.
 */
@Entity({ name: 'eventos_salientes' })
export class EventoSaliente {
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
