import 'reflect-metadata';
import fuenteDatos from '../data-source';
import { EventoReferencia } from '../entidades/evento-referencia.entity';
import { EVENTOS } from './datos-demo';

/**
 * Siembra la proyección de eventos de la puerta.
 *
 * Los ingresos NO se borran aquí: son el registro de quién entró, y vaciarlos
 * al resembrar escondería un doble ingreso entre corrida y corrida. Para
 * limpiarlos del todo hay que decirlo: `npm run semilla -- --con-ingresos`.
 */
async function sembrar(): Promise<void> {
  const conIngresos = process.argv.includes('--con-ingresos');
  await fuenteDatos.initialize();
  try {
    await fuenteDatos.transaction(async (gestor) => {
      if (conIngresos) await gestor.query(`TRUNCATE TABLE "ingresos"`);
      await gestor.query(`TRUNCATE TABLE "eventos_referencia" CASCADE`);
      await gestor.insert(EventoReferencia, EVENTOS);
    });
    console.log(
      `Sembrados ${EVENTOS.length} eventos.` + (conIngresos ? ' Los ingresos se vaciaron.' : ' Los ingresos se conservan.'),
    );
  } finally {
    await fuenteDatos.destroy();
  }
}

void sembrar().catch((error) => {
  console.error('No se pudo sembrar:', error);
  process.exitCode = 1;
});
