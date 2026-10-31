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
    // El cierre va aparte y no tumba el comando. Ocurre DESPUÉS de que el
    // inventario ya quedó escrito, así que un fallo aquí no puede reportar
    // "no se preparó" cuando sí se preparó.
    //
    // No es hipotético: eso pasaba cuando las conexiones nombradas de ADR-12
    // no llevaban su nombre dentro de lo que devuelve la fábrica, y el gancho
    // de @nestjs/typeorm buscaba la conexión por defecto. Está arreglado en
    // los `persistencia.module.ts` de los dos módulos; esto se queda como
    // red, no como parche.
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
