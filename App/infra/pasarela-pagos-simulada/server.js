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
 *   tok_rechazo…   se rechaza          -> caminos CU-006G y CU-001C
 *   tok_timeout…   nunca responde      -> camino CU-006I
 *   tok_error…     responde 502        -> camino CU-006I
 *   tok_noreemb…   el cobro se aprueba, pero su reembolso se rechaza -> CU-003C
 *
 * ## Reembolsos (CU-003)
 *
 * `POST /reembolsos` devuelve dinero de un cobro aprobado, identificado por su
 * referencia. Se rechaza si la referencia no existe (p. ej. la pasarela se
 * reinició y perdió su memoria), si el cobro se hizo con un token
 * `tok_noreemb…`, o si se pide devolver más de lo que queda por devolver.
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

/** Cobros aprobados por referencia, con lo ya reembolsado: los reembolsos los buscan aquí. */
const aprobados = new Map();

/** Reembolsos ya resueltos, por clave de idempotencia. */
const reembolsos = new Map();

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
  if (resultado.estado === 'APROBADO') {
    aprobados.set(resultado.referencia, { monto, reembolsado: 0, permiteReembolso: !token.startsWith('tok_noreemb') });
  }
  console.log(`[pasarela] ${resultado.estado} ${resultado.referencia} monto=${monto}`);
  responder(res, 200, resultado);
}

async function reembolsar(req, res) {
  let cuerpo;
  try {
    cuerpo = await leerCuerpo(req);
  } catch {
    return responder(res, 400, { error: 'Cuerpo JSON inválido' });
  }

  const { referenciaCobro, monto } = cuerpo;
  if (typeof monto !== 'number' || monto <= 0) {
    return responder(res, 400, { error: 'monto debe ser un número positivo' });
  }
  if (typeof referenciaCobro !== 'string' || referenciaCobro.length === 0) {
    return responder(res, 400, { error: 'referenciaCobro es obligatoria' });
  }

  const clave = req.headers['idempotency-key'];
  if (clave && reembolsos.has(clave)) {
    return responder(res, 200, { ...reembolsos.get(clave), repetido: true });
  }

  const cobro = aprobados.get(referenciaCobro);
  let decision;
  if (!cobro) {
    decision = { estado: 'RECHAZADO', motivo: 'No existe un cobro aprobado con esa referencia' };
  } else if (!cobro.permiteReembolso) {
    decision = { estado: 'RECHAZADO', motivo: 'El medio de pago no admite reembolsos' };
  } else if (Math.round((cobro.reembolsado + monto) * 100) > Math.round(cobro.monto * 100)) {
    decision = { estado: 'RECHAZADO', motivo: 'El reembolso supera lo cobrado' };
  } else {
    cobro.reembolsado += monto;
    decision = { estado: 'APROBADO', motivo: null };
  }

  const resultado = {
    referencia: `ree_${randomUUID()}`,
    estado: decision.estado,
    motivo: decision.motivo,
    referenciaCobro,
    monto,
    procesadoEn: new Date().toISOString(),
  };
  if (clave) reembolsos.set(clave, resultado);
  console.log(`[pasarela] reembolso ${resultado.estado} ${referenciaCobro} monto=${monto}`);
  responder(res, 200, resultado);
}

const servidor = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/salud') {
    return responder(res, 200, { servicio: 'pasarela-pagos-simulada', estado: 'arriba' });
  }
  if (req.method === 'POST' && req.url === '/pagos') {
    return void cobrar(req, res);
  }
  if (req.method === 'POST' && req.url === '/reembolsos') {
    return void reembolsar(req, res);
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
