'use strict';

/**
 * Pasarela de Pagos simulada.
 *
 * En el SAD la Pasarela de Pagos es un **sistema externo** (aparece en gris en
 * la vista de componentes, "otro nivel"): no la construye este proyecto. Para
 * poder ejercitar el CU-006 de extremo a extremo hace falta algo que responda
 * al otro lado, y eso es este servicio.
 *
 * Corre como contenedor propio, no como un doble de prueba dentro del servicio
 * de Entradas, para que la llamada sea **HTTP real** y el Procesador de Pagos
 * tenga que lidiar con lo que de verdad pasa en una red: latencia, timeouts y
 * respuestas que no llegan. Un doble en memoria respondería siempre bien y el
 * camino de excepción CU-006I nunca se probaría.
 *
 * Sin dependencias a propósito: solo la librería estándar de Node. Así la
 * imagen es mínima y no hay `npm install` que pueda romperse.
 *
 * ## Cómo se decide el resultado
 *
 * Igual que las pasarelas reales en su entorno de pruebas (las "tarjetas de
 * prueba" de Stripe o Mercado Pago): **lo decide el token que envía el
 * cliente**, no una configuración del servidor. Eso permite que una prueba
 * dispare un rechazo sin pedirle nada a la pasarela, y que el servicio de
 * Entradas no tenga forma de "pedir" un resultado concreto — solo cobra.
 *
 *   tok_ok…        el cobro se aprueba
 *   tok_rechazo…   se rechaza          -> camino CU-006G
 *   tok_timeout…   nunca responde      -> camino CU-006I
 *   tok_error…     responde 502        -> camino CU-006I
 *
 * ## Idempotencia
 *
 * Respeta la cabecera `Idempotency-Key`: dos llamadas con la misma clave
 * devuelven **el mismo resultado y la misma referencia**, sin cobrar dos veces.
 * Es lo que hace seguro reintentar cuando no se sabe si el primer intento llegó
 * (CU-006I), y es como funcionan las pasarelas de verdad.
 */

const http = require('node:http');
const { randomUUID } = require('node:crypto');

const PUERTO = Number(process.env.PUERTO || 3099);

/** Cobros ya resueltos, por clave de idempotencia. En memoria: es un simulador. */
const cobros = new Map();

function responder(res, estado, cuerpo) {
  const texto = JSON.stringify(cuerpo);
  res.writeHead(estado, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(texto),
  });
  res.end(texto);
}

function leerCuerpo(req) {
  return new Promise((resolve, reject) => {
    const trozos = [];
    req.on('data', (t) => trozos.push(t));
    req.on('end', () => {
      try {
        const crudo = Buffer.concat(trozos).toString('utf8');
        resolve(crudo ? JSON.parse(crudo) : {});
      } catch (error) {
        reject(error);
      }
    });
    req.on('error', reject);
  });
}

function decidir(token) {
  if (token.startsWith('tok_rechazo')) {
    return { estado: 'RECHAZADO', motivo: 'Fondos insuficientes' };
  }
  return { estado: 'APROBADO', motivo: null };
}

async function cobrar(req, res) {
  let cuerpo;
  try {
    cuerpo = await leerCuerpo(req);
  } catch {
    return responder(res, 400, { error: 'Cuerpo JSON inválido' });
  }

  const { monto, moneda, token, descripcion } = cuerpo;

  if (typeof monto !== 'number' || monto <= 0) {
    return responder(res, 400, { error: 'monto debe ser un número positivo' });
  }
  if (typeof token !== 'string' || token.length === 0) {
    return responder(res, 400, { error: 'token es obligatorio' });
  }

  // Comprobación de que el servicio de Entradas cumple RNF-05: no debe
  // mandarnos datos de tarjeta, solo un token. Si aparecen, se rechaza en vez
  // de aceptarlos en silencio.
  for (const prohibido of ['pan', 'numeroTarjeta', 'cvv', 'cvc', 'expiracion']) {
    if (prohibido in cuerpo) {
      return responder(res, 400, {
        error: `No envíes datos de tarjeta ("${prohibido}"): el cobro se delega a la pasarela (RNF-05)`,
      });
    }
  }

  const clave = req.headers['idempotency-key'];
  if (clave && cobros.has(clave)) {
    const previo = cobros.get(clave);
    console.log(`[pasarela] repetido ${clave} -> ${previo.estado} ${previo.referencia}`);
    return responder(res, 200, { ...previo, repetido: true });
  }

  // Nunca responde: el cliente tiene que cortar por su propio timeout.
  if (token.startsWith('tok_timeout')) {
    console.log('[pasarela] token de timeout: no se responde a propósito');
    return; // la conexión queda abierta hasta que el cliente se rinda
  }

  if (token.startsWith('tok_error')) {
    console.log('[pasarela] token de error: 502');
    return responder(res, 502, { error: 'Pasarela no disponible' });
  }

  const decision = decidir(token);
  const resultado = {
    referencia: `pas_${randomUUID()}`,
    estado: decision.estado,
    motivo: decision.motivo,
    monto,
    moneda: moneda || 'COP',
    descripcion: descripcion || null,
    procesadoEn: new Date().toISOString(),
  };

  if (clave) cobros.set(clave, resultado);
  console.log(`[pasarela] ${resultado.estado} ${resultado.referencia} monto=${monto}`);
  responder(res, 200, resultado);
}

const servidor = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/salud') {
    return responder(res, 200, { servicio: 'pasarela-pagos-simulada', estado: 'arriba' });
  }
  if (req.method === 'POST' && req.url === '/pagos') {
    return void cobrar(req, res);
  }
  responder(res, 404, { error: 'Ruta no encontrada' });
});

servidor.listen(PUERTO, () => {
  console.log(`[pasarela] escuchando en http://0.0.0.0:${PUERTO}`);
});

// Cierre ordenado para que `docker compose down` no tarde diez segundos.
for (const senal of ['SIGTERM', 'SIGINT']) {
  process.on(senal, () => servidor.close(() => process.exit(0)));
}
