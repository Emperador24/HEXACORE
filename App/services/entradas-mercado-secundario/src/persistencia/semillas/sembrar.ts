import fuenteDatos from '../data-source';
import { Entrada } from '../entidades/entrada.entity';
import { EventoReferencia } from '../entidades/evento-referencia.entity';
import { HistorialPropietario, MotivoCambioPropietario } from '../entidades/historial-propietario.entity';
import { ENTRADAS, EVENTOS, USUARIOS } from './datos-demo';

/**
 * Siembra los datos de desarrollo del CU-006.
 *
 * Este servicio no implementa CU-001 (compra de entradas) — ese caso de uso es
 * de Daniel —, pero el CU-006 lo necesita como requisito previo: su propia
 * ficha lo dice, *"CU-001: Compra de entradas (requisito previo para poseer
 * una entrada a revender)"*. Esta semilla es lo que suple esa dependencia
 * mientras CU-001 no exista, sin invadirlo: crea filas directamente en la base,
 * no expone ningún endpoint de alta de entradas.
 *
 *   npm run semilla
 */

async function sembrar(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('La semilla de demostración no se ejecuta en producción');
  }

  await fuenteDatos.initialize();
  console.log(`Conectado a ${fuenteDatos.options.database}`);

  try {
    await fuenteDatos.transaction(async (gestor) => {
      // TRUNCATE y no DELETE: el disparador que hace inmutable
      // `historial_propietarios` intercepta UPDATE y DELETE por fila, pero no
      // TRUNCATE. Esa puerta se deja abierta a propósito para poder reiniciar
      // los datos de desarrollo; en producción la protección real es que el
      // rol de la aplicación no debe tener permiso de TRUNCATE sobre la tabla.
      await gestor.query(`
        TRUNCATE TABLE
          "historial_propietarios",
          "transacciones_reventa",
          "publicaciones_reventa",
          "entradas",
          "eventos_referencia"
        RESTART IDENTITY CASCADE
      `);

      await gestor.insert(EventoReferencia, EVENTOS);

      for (const demo of ENTRADAS) {
        await gestor.insert(Entrada, {
          id: demo.id,
          eventoId: demo.eventoId,
          localidadId: demo.localidadId,
          localidadNombre: demo.localidadNombre,
          propietarioId: demo.propietarioId,
          codigoQr: demo.codigoQr,
          estado: demo.estado,
          precioOriginal: demo.precioOriginal,
          numeroTicket: demo.numeroTicket,
        });

        // Cada entrada nace con su fila de EMISION en el historial. Sin ella,
        // el historial de una entrada revendida empezaría por su segundo dueño
        // y la cadena de propietarios que exige la post-condición 3 del CU-006
        // quedaría coja desde el primer día.
        await gestor.insert(HistorialPropietario, {
          entradaId: demo.id,
          propietarioAnteriorId: null,
          propietarioNuevoId: demo.propietarioId,
          motivo: MotivoCambioPropietario.EMISION,
          transaccionId: null,
          codigoQrAnterior: null,
          codigoQrNuevo: demo.codigoQr,
        });
      }
    });

    console.log(`\n${EVENTOS.length} eventos y ${ENTRADAS.length} entradas sembradas.\n`);
    console.log('Usuarios de demostración:');
    for (const [clave, usuario] of Object.entries(USUARIOS)) {
      console.log(`  ${clave.padEnd(6)} ${usuario.id}  ${usuario.nombre}`);
    }
    console.log('\nEntradas y para qué sirve cada una:');
    for (const entrada of ENTRADAS) {
      console.log(`  ${entrada.numeroTicket}  ${entrada.estado.padEnd(10)} ${entrada.paraQue}`);
    }
    console.log('');
  } finally {
    await fuenteDatos.destroy();
  }
}

sembrar().catch((error: unknown) => {
  console.error('La semilla falló:', error);
  process.exit(1);
});
