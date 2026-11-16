import { availableParallelism } from 'node:os';

/**
 * Tamaño del pool de hilos de libuv, que es donde corre scrypt.
 *
 * **Tiene que importarse lo primero en `main.ts`**: libuv lee esta variable la
 * primera vez que usa el pool, y a partir de ahí ya no la vuelve a mirar.
 *
 * ## Por qué
 *
 * Node trae **4 hilos** por defecto, tenga la máquina los núcleos que tenga. En
 * este servicio eso es el techo del login: scrypt tarda ~50 ms, así que 4 hilos
 * dan ~76 logins/s por instancia (medido), y con 300 personas entrando a la vez
 * cada una esperaba ~4 s. Ver DECISIONES.md §17.
 *
 * Se usa un hilo por núcleo disponible: scrypt es CPU pura, y más hilos que
 * núcleos no añaden capacidad, solo cambios de contexto. `UV_THREADPOOL_SIZE`
 * en el entorno manda sobre esto (por ejemplo, para limitarlo en un contenedor
 * con cuota de CPU que Node no detecte).
 */
if (!process.env.UV_THREADPOOL_SIZE) {
  process.env.UV_THREADPOOL_SIZE = String(Math.min(64, Math.max(4, availableParallelism())));
}
