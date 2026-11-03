import 'reflect-metadata';
import fuenteDatos from '../data-source';
import { EventoReferencia } from '../entidades/evento-referencia.entity';
import { LocalidadEvento } from '../entidades/localidad-evento.entity';
import { EVENTOS, LOCALIDADES_EVENTO } from './datos-demo';

/**
 * Siembra la proyección de eventos de la cartelera.
 *
 * Es idempotente: borra y vuelve a insertar dentro de una transacción, así que
 * correrla dos veces deja la base igual que correrla una. Mientras no exista
 * Eventos y recintos, esto hace el papel que hará el consumidor de
 * `EventoPublicado`.
 *
 * Los ids coinciden con los que siembra `ventas`: son la
 * misma proyección en dos bases distintas, y tienen que seguir cuadrando hasta
 * que el broker las mantenga al día.
 */
async function sembrar(): Promise<void> {
  await fuenteDatos.initialize();
  try {
    await fuenteDatos.transaction(async (gestor) => {
      // TRUNCATE y no DELETE: vacía las dos de una vez, resuelve el orden por
      // la dependencia entre ellas y reinicia cualquier secuencia. Además,
      // TypeORM rechaza `delete` sin criterio, que es lo que querríamos aquí.
      await gestor.query(`TRUNCATE TABLE "localidades_evento", "eventos_referencia" CASCADE`);
      await gestor.insert(EventoReferencia, EVENTOS);
      await gestor.insert(LocalidadEvento, LOCALIDADES_EVENTO);
    });
    console.log(`Sembrados ${EVENTOS.length} eventos y ${LOCALIDADES_EVENTO.length} localidades.`);
  } finally {
    await fuenteDatos.destroy();
  }
}

void sembrar().catch((error) => {
  console.error('No se pudo sembrar:', error);
  process.exitCode = 1;
});
