import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

/**
 * Copia local de los pocos datos del Evento que el mercado secundario
 * necesita. El Evento en sí pertenece al servicio `eventos-emergencias`
 * (SAD §12: `Evento(id, nombre, fecha, categoria, recinto_id, aforo)`), y
 * ADR-01 prohíbe que este servicio lea su base de datos.
 *
 * ¿Por qué una proyección local y no una llamada HTTP al servicio de Eventos
 * en cada operación?
 *
 * 1. **RNF-18** exige que cada microservicio *"pueda probarse de forma
 *    aislada, sin levantar los demás"*. Una llamada síncrona en mitad del
 *    checkout haría imposible probar el CU-006 sin el servicio de Eventos.
 * 2. **CU-006I** ya obliga a tratar el fallo de *un* sistema externo (la
 *    pasarela) dentro del checkout. Añadir un segundo punto de fallo síncrono
 *    —y encima interno— empeoraría la disponibilidad que el propio CU-006
 *    reclama: *"el mercado secundario debe permanecer operativo especialmente
 *    en los días previos al evento"*.
 * 3. Es la consecuencia que ADR-01 ya aceptó por escrito: *"gestionar
 *    consistencia eventual entre servicios en vez de transacciones ACID
 *    únicas"*.
 *
 * La tabla se mantiene al día consumiendo los eventos que publique el servicio
 * de Eventos en RabbitMQ. Mientras ese servicio no exista, se puebla con la
 * semilla de desarrollo (`npm run semilla`).
 *
 * Consecuencia asumida: si un organizador desactiva la reventa de un evento,
 * este servicio puede tardar unos segundos en enterarse. Es tolerable —
 * bloquear publicaciones nuevas no es una operación con ventana crítica—, pero
 * hay que saberlo.
 */
@Entity({ name: 'eventos_referencia' })
export class EventoReferencia {
  /** Mismo identificador que en el servicio de Eventos; aquí no se genera. */
  @PrimaryColumn({ name: 'evento_id', type: 'uuid' })
  eventoId: string;

  @Column({ name: 'nombre', type: 'varchar', length: 200 })
  nombre: string;

  /** Momento en que arranca el evento: es lo que hace expirar las publicaciones (CU-006D). */
  @Column({ name: 'fecha_inicio', type: 'timestamptz' })
  fechaInicio: Date;

  @Column({ name: 'lugar', type: 'varchar', length: 200 })
  lugar: string;

  @Column({ name: 'ciudad', type: 'varchar', length: 120 })
  ciudad: string;

  /**
   * Política de reventa del evento. Su valor `false` es lo que dispara el
   * camino de excepción CU-006F ("El evento no permite reventa") y lo que
   * comprueba la pre-condición 3 del CU-006.
   */
  @Column({ name: 'permite_reventa', type: 'boolean', default: true })
  permiteReventa: boolean;

  /** Cuándo se sincronizó por última vez con el servicio de Eventos. */
  @UpdateDateColumn({ name: 'actualizado_en', type: 'timestamptz' })
  actualizadoEn: Date;
}
