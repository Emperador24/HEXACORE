import { HttpException } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { isUUID } from 'class-validator';
import Redis from 'ioredis';
import { InventarioModule } from './inventario.module';
import { PreparacionInventarioService } from './preparacion-inventario.service';
import { REDIS_INVENTARIO } from './redis-inventario.provider';

/** Comando de mantenimiento; NO inicia el servidor HTTP ni ejecuta migraciones. */
async function preparar(): Promise<void> {
  const [establecimientoId, confirmacion, ...extras] = process.argv.slice(2);
  if (!establecimientoId || !isUUID(establecimientoId) || confirmacion !== '--compras-detenidas' || extras.length) {
    throw new Error('Uso: npx ts-node src/modulos/pedidos/inventario/preparar-inventario.ts <establecimientoId> --compras-detenidas. Detén compras y cambios de stock en todas las instancias antes de ejecutar.');
  }
  const app = await NestFactory.createApplicationContext(InventarioModule, { abortOnError: false });
  try {
    const redis = app.get<Redis>(REDIS_INVENTARIO);
    if (redis.status !== 'ready') {
      await new Promise<void>((resolve, reject) => {
        const limpiar = () => { clearTimeout(timer); redis.off('ready', listo); redis.off('error', fallo); };
        const listo = () => { limpiar(); resolve(); };
        const fallo = () => { limpiar(); reject(new Error('Redis de inventario no disponible')); };
        const timer = setTimeout(fallo, 3000);
        redis.once('ready', listo); redis.once('error', fallo);
      });
    }
    const resultado = await app.get(PreparacionInventarioService).preparar(establecimientoId);
    console.log(`Inventario preparado: ${resultado.establecimientoId}, ${resultado.productosPreparados} productos.`);
  } finally {
    // El cierre va aparte y no tumba el comando: desde ADR-12 las conexiones
    // de TypeORM van **nombradas** (`administracion`, `pedidos`) y no existe
    // la conexión por defecto, pero el gancho de apagado de @nestjs/typeorm la
    // busca igual y lanza `UnknownElementException: could not find DataSource`.
    //
    // Pasa DESPUÉS de que el inventario ya quedó escrito, así que hacerlo
    // fallar diría que no se preparó cuando sí se preparó —y eso es lo que
    // rompía las suites de CU-011—. Se avisa en vez de callarlo: el fallo de
    // apagado es real y hay que arreglarlo en su sitio.
    try {
      await app.close();
    } catch (error) {
      console.warn(
        'Aviso: el inventario quedó preparado, pero el apagado falló. ' +
          'Es el gancho de @nestjs/typeorm buscando la conexión por defecto, que aquí no existe (ADR-12).',
        error instanceof Error ? error.message : error,
      );
    }
  }
}

preparar().catch((error: unknown) => {
  // No emitir errores crudos de Redis/PostgreSQL ni sus parámetros.
  console.error('No se preparó el inventario:', error instanceof HttpException ? error.getResponse()
    : error instanceof Error && error.message.startsWith('Uso:') ? error.message : 'Revisa conexiones y migraciones; la preparación podría haber quedado aplicada.');
  process.exitCode = 1;
});
