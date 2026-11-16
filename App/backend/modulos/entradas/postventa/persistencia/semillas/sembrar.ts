import 'reflect-metadata';
import fuenteDatos from '../data-source';
import { EventoReferencia } from '../entidades/evento-referencia.entity';
import { EVENTOS } from './datos-demo';

/**
 * Siembra la proyección de eventos de la reventa.
 *
 * **Las publicaciones y transacciones NO se tocan aquí**, y es deliberado:
 * una transacción de reventa es el registro de un cobro (RNF-11), y borrarla al
 * resembrar escondería entre corridas justo lo que hay que poder auditar. Las
 * suites de integración limpian lo suyo al empezar, que es distinto de que la
 * semilla lo haga por su cuenta.
 *
 * Para vaciarlas del todo hay que decirlo: `npm run semilla -- --con-reventas`.
 */
async function sembrar(): Promise<void> {
  const conReventas = process.argv.includes('--con-reventas');
  await fuenteDatos.initialize();
  try {
    await fuenteDatos.transaction(async (gestor) => {
      if (conReventas) {
        // En este orden: la transacción referencia la publicación.
        await gestor.query(`TRUNCATE TABLE "transacciones_reventa", "publicaciones_reventa" CASCADE`);
      }
      await gestor.query(`TRUNCATE TABLE "eventos_referencia" CASCADE`);
      await gestor.insert(EventoReferencia, EVENTOS);
    });
    console.log(
      `Sembrados ${EVENTOS.length} eventos.` +
        (conReventas ? ' Las publicaciones y transacciones se vaciaron.' : ' Las reventas se conservan.'),
    );
  } finally {
    await fuenteDatos.destroy();
  }
}

void sembrar().catch((error) => {
  console.error('No se pudo sembrar:', error);
  process.exitCode = 1;
});
