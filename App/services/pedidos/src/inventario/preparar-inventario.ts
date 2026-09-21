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
    throw new Error('Uso: npx ts-node src/inventario/preparar-inventario.ts <establecimientoId> --compras-detenidas. Detén compras y cambios de stock en todas las instancias antes de ejecutar.');
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
  } finally { await app.close(); }
}

preparar().catch((error: unknown) => {
  // No emitir errores crudos de Redis/PostgreSQL ni sus parámetros.
  console.error('No se preparó el inventario:', error instanceof HttpException ? error.getResponse()
    : error instanceof Error && error.message.startsWith('Uso:') ? error.message : 'Revisa conexiones y migraciones; la preparación podría haber quedado aplicada.');
  process.exitCode = 1;
});
