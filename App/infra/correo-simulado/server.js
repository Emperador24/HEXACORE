'use strict';

/**
 * Proveedor de Notificaciones simulado — solo correo.
 *
 * En el SAD el **Proveedor de Notificaciones** es un sistema externo (la vista
 * de contenedores lo sitúa fuera, alcanzado por HTTPS/REST desde la cola de
 * mensajes). No lo construye este proyecto.
 *
 * Esto es lo que responde al otro lado, y existe por el mismo motivo que la
 * pasarela de pagos simulada: el camino de excepción **CU-027E** dice que *"el
 * correo de verificación/recuperación no puede enviarse por falla del proveedor
 * de notificaciones; el sistema reintenta y notifica al usuario si el error
 * persiste"*. Con un doble en memoria dentro del servicio, ese fallo nunca
 * ocurriría de verdad.
 *
 * Además sirve para algo que un proveedor real haría incómodo: **leer los
 * correos enviados** desde una prueba, y con ellos el enlace de verificación.
 *
 * Sin dependencias: solo la librería estándar de Node.
 */

const http = require('node:http');
const { randomUUID } = require('node:crypto');

const PUERTO = Number(process.env.PUERTO || 3098);

/** Correos entregados, del más reciente al más antiguo. En memoria: es un simulador. */
const bandeja = [];

/** Cuántos envíos deben fallar antes de volver a funcionar (ver /control/fallar). */
let falloscPendientes = 0;

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

async function enviar(req, res) {
  let cuerpo;
  try {
    cuerpo = await leerCuerpo(req);
  } catch {
    return responder(res, 400, { error: 'Cuerpo JSON inválido' });
  }

  const { para, asunto, texto } = cuerpo;
  if (!para || !asunto || !texto) {
    return responder(res, 400, { error: 'Faltan para, asunto o texto' });
  }

  // Fallo temporal programado: sirve para comprobar que el reintento funciona
  // y que el mensaje acaba entregándose cuando el proveedor se recupera.
  if (falloscPendientes > 0) {
    falloscPendientes -= 1;
    console.log(`[correo] fallo programado (quedan ${falloscPendientes}) -> 503 a ${para}`);
    return responder(res, 503, { error: 'Proveedor de notificaciones no disponible' });
  }

  // Dirección que siempre rebota, como una casilla inexistente. Permite probar
  // el fallo permanente de CU-027E: reintentar no lo va a arreglar.
  //
  // Responde **400 y no 550**: 550 es un código SMTP, y esta es una API HTTP.
  // Colarlo aquí lo situaba en el rango 5xx, que significa "el servidor tuvo un
  // problema, vuelve a intentarlo" — y el consumidor reintentaba tres veces una
  // dirección que nunca iba a existir. En HTTP, "el destinatario no existe" es
  // un error de la petición.
  // Cualquier dirección cuyo buzón empiece por "rebota": rebota@, rebota2@…
  if (/^rebota/i.test(String(para))) {
    console.log(`[correo] dirección que rebota -> 400 a ${para}`);
    return responder(res, 400, { error: 'Destinatario no existe', smtp: 550 });
  }

  const correo = {
    id: randomUUID(),
    para,
    asunto,
    texto,
    enviadoEn: new Date().toISOString(),
  };
  bandeja.unshift(correo);
  // La bandeja no crece sin límite: es un simulador de larga vida en Docker.
  if (bandeja.length > 500) bandeja.length = 500;

  console.log(`[correo] entregado a ${para}: ${asunto}`);
  responder(res, 202, { id: correo.id, estado: 'ENTREGADO' });
}

const servidor = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PUERTO}`);

  if (req.method === 'GET' && url.pathname === '/salud') {
    return responder(res, 200, { servicio: 'correo-simulado', estado: 'arriba', enBandeja: bandeja.length });
  }

  if (req.method === 'POST' && url.pathname === '/correos') {
    return void enviar(req, res);
  }

  // Leer la bandeja. Es lo que permite a una prueba sacar el enlace de
  // verificación del correo, igual que haría una persona abriéndolo.
  if (req.method === 'GET' && url.pathname === '/correos') {
    const para = url.searchParams.get('para');
    const filtrados = para ? bandeja.filter((c) => c.para === para) : bandeja;
    return responder(res, 200, { total: filtrados.length, correos: filtrados.slice(0, 50) });
  }

  if (req.method === 'DELETE' && url.pathname === '/correos') {
    bandeja.length = 0;
    return responder(res, 200, { estado: 'VACIADA' });
  }

  // Programa los próximos N envíos para que fallen.
  if (req.method === 'POST' && url.pathname === '/control/fallar') {
    const veces = Number(url.searchParams.get('veces') || 1);
    falloscPendientes = Number.isFinite(veces) && veces > 0 ? veces : 1;
    console.log(`[correo] los próximos ${falloscPendientes} envíos fallarán`);
    return responder(res, 200, { fallosProgramados: falloscPendientes });
  }

  responder(res, 404, { error: 'Ruta no encontrada' });
});

servidor.listen(PUERTO, () => {
  console.log(`[correo] escuchando en http://0.0.0.0:${PUERTO}`);
});

for (const senal of ['SIGTERM', 'SIGINT']) {
  process.on(senal, () => servidor.close(() => process.exit(0)));
}
