// CPU y memoria de cada contenedor del sistema, en formato Prometheus, leídas
// de la API de Docker por su socket. Expone los mismos nombres de métrica que
// cAdvisor (`container_cpu_usage_seconds_total`,
// `container_memory_working_set_bytes`) para que el tablero sirva con cualquiera
// de los dos.
//
// Por qué no cAdvisor: con el almacén de imágenes de containerd que usa Docker
// Desktop, cAdvisor (0.49 y 0.52) no registra ningún contenedor ("failed to
// identify the read-write layer ID") y solo informa del total de la máquina.
// La API de Docker da lo mismo en cualquier instalación.
import { request, createServer } from 'node:http';

const SOCKET = '/var/run/docker.sock';
const PROYECTOS = new RegExp(process.env.PROYECTOS ?? '^hexacore-(infra|adr16)$');
const PUERTO = Number(process.env.PUERTO ?? 9338);

function docker(ruta) {
  return new Promise((ok, falla) => {
    const pet = request({ socketPath: SOCKET, path: ruta, timeout: 4000 }, (res) => {
      let cuerpo = '';
      res.on('data', (t) => (cuerpo += t));
      res.on('end', () => (res.statusCode === 200 ? ok(JSON.parse(cuerpo)) : falla(new Error(`${ruta} → ${res.statusCode}`))));
    });
    pet.on('timeout', () => pet.destroy(new Error(`${ruta}: sin respuesta`)));
    pet.on('error', falla);
    pet.end();
  });
}

const etiqueta = (v) => String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"');

async function metricas() {
  const contenedores = (await docker('/containers/json')).filter((c) => PROYECTOS.test(c.Labels['com.docker.compose.project'] ?? ''));
  const filas = await Promise.all(contenedores.map(async (c) => {
    try {
      const s = await docker(`/containers/${c.Id}/stats?stream=false&one-shot=true`);
      const etiquetas = `name="${etiqueta(c.Names[0].replace(/^\//, ''))}",servicio="${etiqueta(c.Labels['com.docker.compose.service'] ?? '')}",` +
        `container_label_com_docker_compose_project="${etiqueta(c.Labels['com.docker.compose.project'])}"`;
      const memoria = s.memory_stats ?? {};
      // Lo mismo que cAdvisor: uso menos la caché de archivos que se puede liberar.
      const inactiva = memoria.stats?.inactive_file ?? memoria.stats?.total_inactive_file ?? 0;
      return [
        `container_cpu_usage_seconds_total{${etiquetas}} ${(s.cpu_stats?.cpu_usage?.total_usage ?? 0) / 1e9}`,
        `container_memory_working_set_bytes{${etiquetas}} ${Math.max(0, (memoria.usage ?? 0) - inactiva)}`,
      ];
    } catch {
      return []; // Se fue entre la lista y la consulta: aparecerá o desaparecerá en la próxima.
    }
  }));
  return [
    '# TYPE container_cpu_usage_seconds_total counter',
    '# TYPE container_memory_working_set_bytes gauge',
    ...filas.flat(),
    '',
  ].join('\n');
}

createServer(async (pet, res) => {
  if (pet.url !== '/metrics') return res.writeHead(404).end();
  try {
    res.writeHead(200, { 'Content-Type': 'text/plain; version=0.0.4' }).end(await metricas());
  } catch (error) {
    res.writeHead(503).end(`# ${error.message}\n`);
  }
}).listen(PUERTO, () => console.log(`exportador-docker en :${PUERTO}`));
