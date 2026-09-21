import fuenteDatos from '../data-source';
import { cargarConfiguracion } from '../../config/configuracion';
import { EventoReferencia } from '../entidades/evento-referencia.entity';
import { Establecimiento } from '../entidades/establecimiento.entity';
import { Producto } from '../entidades/producto.entity';
import { EVENTOS, ESTABLECIMIENTOS, PRODUCTOS } from './datos-demo';

/**
 * Prepara las dependencias de menú e inventario para probar CU-011.
 * Requiere la migración inicial aplicada. Se ejecuta con `npm run semilla`.
 * Cada ejecución borra los datos de las siete tablas de dominio, incluidas las
 * compras de desarrollo; la tabla de migraciones se conserva.
 */
async function sembrar(): Promise<void> {
  if (cargarConfiguracion().entorno === 'production') {
    throw new Error('La semilla de demostración no se ejecuta en producción');
  }

  try {
    await fuenteDatos.initialize();
    console.log(`Conectado a ${fuenteDatos.options.database}`);

    await fuenteDatos.transaction(async (gestor) => {
      // Una sola operación incluye todas las tablas relacionadas por FK.
      // RESTRICT evita extender la limpieza a otras tablas mediante cascada.
      await gestor.query(`
        TRUNCATE TABLE
          "reservas_inventario",
          "transacciones_pedido",
          "detalles_pedido",
          "pedidos",
          "productos",
          "establecimientos",
          "eventos_referencia"
        RESTART IDENTITY RESTRICT
      `);

      await gestor.insert(EventoReferencia, EVENTOS);
      await gestor.insert(Establecimiento, ESTABLECIMIENTOS);
      await gestor.insert(Producto, PRODUCTOS);
    });

    console.log(`\n${EVENTOS.length} evento, ${ESTABLECIMIENTOS.length} establecimientos y ${PRODUCTOS.length} productos sembrados.`);
    for (const evento of EVENTOS) {
      console.log(`  Evento: ${evento.nombre} (${evento.eventoId})`);
    }
    for (const establecimiento of ESTABLECIMIENTOS) {
      console.log(`  ${establecimiento.nombre}: ${establecimiento.estado} — ${establecimiento.puntoEntrega}`);
    }
    for (const producto of PRODUCTOS) {
      console.log(`  ${producto.nombre}: precio=${producto.precio}, inventario=${producto.cantidadInventario}, activo=${producto.activo}`);
    }
    console.log('Pedidos, detalles, intentos de pago y reservas quedaron vacíos.');
  } finally {
    if (fuenteDatos.isInitialized) {
      await fuenteDatos.destroy();
    }
  }
}

sembrar().catch((error: unknown) => {
  console.error('La semilla falló:', error);
  process.exitCode = 1;
});
