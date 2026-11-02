import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

/**
 * Ciclo de vida del Evento según CU-026 (*"crea, edita, publica y cancela"*).
 * Lo decide el servicio de Eventos; aquí solo se copia. La cartelera (CU-005)
 * muestra únicamente los `PUBLICADO`.
 */
export enum EstadoEvento {
  BORRADOR = 'BORRADOR',
  PUBLICADO = 'PUBLICADO',
  CANCELADO = 'CANCELADO',
}

/**
 * Copia local de los datos del Evento que este servicio necesita: los de la
 * reventa (CU-006) y los de la cartelera (CU-005, ver DECISIONES.md §12). El
 * Evento en sí pertenece al servicio `eventos-emergencias`
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

  /**
   * Sin valor por defecto, a propósito: quien inserte un evento tiene que
   * decir su estado. Un defecto de `PUBLICADO` haría que una fila mal mapeada
   * —del consumidor de RabbitMQ que aún no existe, por ejemplo— apareciera en
   * la cartelera con entradas a la venta. La columna tampoco lo tiene en la
   * base (ver la migración de la cartelera).
   */
  @Column({
    name: 'estado',
    type: 'enum',
    enum: EstadoEvento,
    enumName: 'evento_estado',
  })
  estado: EstadoEvento;

  /** "Conciertos", "Teatro"… Filtro del CU-005. */
  @Column({ name: 'categoria', type: 'varchar', length: 60 })
  categoria: string;

  /** Artista o cabeza de cartel. Opcional: una feria no tiene artista. Filtro del CU-005. */
  @Column({ name: 'artista', type: 'varchar', length: 200, nullable: true })
  artista: string | null;

  @Column({ name: 'descripcion', type: 'text', nullable: true })
  descripcion: string | null;

  /** Fin del evento: con `fechaInicio` forma el horario que muestra el paso 8 del CU-005. */
  @Column({ name: 'fecha_fin', type: 'timestamptz', nullable: true })
  fechaFin: Date | null;

  @Column({ name: 'imagen_url', type: 'varchar', length: 500, nullable: true })
  imagenUrl: string | null;

  /**
   * Máximo de personas dentro del recinto a la vez (SAD §12: `Evento.aforo`).
   * Null = sin tope propio más allá de las entradas vendidas. Es lo que
   * comprueba el paso 5 del CU-002 y lo que dispara CU-002B.
   */
  @Column({ name: 'aforo_maximo', type: 'integer', nullable: true })
  aforoMaximo: number | null;

  /**
   * Personas que han ingresado (paso 8 del CU-002: *"Actualiza el aforo del
   * evento"*). Lo mantiene este servicio, no el de Eventos.
   */
  @Column({ name: 'asistentes', type: 'integer', default: 0 })
  asistentes: number;

  /** Cuándo se sincronizó por última vez con el servicio de Eventos. */
  @UpdateDateColumn({ name: 'actualizado_en', type: 'timestamptz' })
  actualizadoEn: Date;
}
