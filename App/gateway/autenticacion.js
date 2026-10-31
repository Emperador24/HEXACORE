/**
 * Autenticación y autorización del API Gateway (ADR-02, ADR-15).
 *
 * Lo ejecuta Nginx (njs) como subpetición `auth_request` antes de enrutar una
 * ruta protegida. Hace tres cosas, en este orden:
 *
 * 1. **Valida el JWT aquí mismo, con la clave pública.** Firma RS256, emisor,
 *    caducidad y forma del contenido, las mismas reglas que
 *    `App/shared/seguridad/token-sesion.md`. No llama a Autenticación: antes el
 *    gateway le preguntaba en cada petición, y eso convertía al servicio que
 *    emite los tokens en un paso obligado de todo el tráfico, con su latencia
 *    y su caída.
 * 2. **Autoriza por rol**, si la ruta declara `$roles_requeridos`.
 * 3. **Gasta el turno de la Cola virtual**, si la ruta declara
 *    `$turno_requerido`. Es lo que impide comprar sin haber pasado por la fila.
 *
 * Responde 204 con `X-Usuario-Id` y `X-Usuario-Roles`, o 401/403 con el motivo
 * en `X-Motivo`, que el `nginx.conf` traduce a una respuesta JSON.
 *
 * ## Lo que el gateway NO comprueba
 *
 * Que la sesión no esté cerrada. Eso vive en Redis (`sesion-revocada:<jti>`) y
 * lo siguen comprobando los servicios, que además vuelven a verificar el token
 * por su cuenta (RNF-06). Un token de una sesión cerrada pasa el gateway y lo
 * rechaza el servicio: la garantía es la misma, solo cambia quién responde.
 */
import fs from 'fs';

const ARCHIVO_CLAVE = '/etc/nginx/claves/jwt-publica.pem';
const EMISOR = 'hexacore-administracion';
const ES_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** La clave se importa una vez por proceso: importarla en cada petición es trabajo repetido. */
let clave = null;

async function clavePublica() {
  if (!clave) {
    const pem = fs.readFileSync(ARCHIVO_CLAVE, 'utf8');
    const der = Buffer.from(pem.replace(/-----[^-]+-----|\s/g, ''), 'base64');
    clave = await crypto.subtle.importKey('spki', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  }
  return clave;
}

function leerParte(parte) {
  return JSON.parse(Buffer.from(parte, 'base64url').toString());
}

/** La sesión del token, o `null` si no es auténtico o no está en vigor. */
async function sesionDe(token) {
  const partes = token.split('.');
  if (partes.length !== 3) return null;

  let cabecera;
  let contenido;
  try {
    cabecera = leerParte(partes[0]);
    contenido = leerParte(partes[1]);
  } catch (e) {
    return null;
  }
  // El algoritmo se fija aquí, no se acepta el que declare el token: si no,
  // `alg: none` o un HS256 "firmado" con la clave pública pasarían.
  if (!cabecera || cabecera.alg !== 'RS256') return null;

  // En una variable aparte: njs no admite `await` dentro de los argumentos.
  const verificadora = await clavePublica();
  const firmaValida = await crypto.subtle.verify(
    { name: 'RSASSA-PKCS1-v1_5' },
    verificadora,
    Buffer.from(partes[2], 'base64url'),
    `${partes[0]}.${partes[1]}`,
  );
  if (!firmaValida) return null;

  // Sin desestructurar: njs no lo admite.
  const c = contenido || {};
  const sub = c.sub;
  const roles = c.roles;
  const jti = c.jti;
  const iat = c.iat;
  const exp = c.exp;
  const ahora = Math.floor(Date.now() / 1000);
  if (
    c.iss !== EMISOR ||
    typeof sub !== 'string' || !ES_UUID.test(sub) ||
    typeof jti !== 'string' || !ES_UUID.test(jti) ||
    !Number.isInteger(iat) || !Number.isInteger(exp) ||
    exp <= ahora || exp <= iat || exp - iat > 3600 || iat > ahora ||
    !Array.isArray(roles) || !roles.every((rol) => typeof rol === 'string')
  ) {
    return null;
  }
  return { usuarioId: sub, roles };
}

function negar(r, estado, motivo) {
  r.headersOut['X-Motivo'] = motivo;
  r.return(estado);
}

/**
 * Gasta el turno en la Cola virtual, con la sesión de quien compra: un turno
 * solo vale para su dueño. Devuelve el evento del turno, o el motivo del
 * rechazo.
 */
async function gastarTurno(r, autorizacion) {
  const turno = r.headersIn['X-Turno-Cola'];
  if (!turno || !ES_UUID.test(turno)) return { motivo: 'TURNO_REQUERIDO' };

  let respuesta;
  try {
    respuesta = await ngx.fetch(`http://${r.variables.cola}/api/v1/interno/cola/turnos/${turno}`, {
      method: 'DELETE',
      headers: { Authorization: autorizacion },
    });
  } catch (e) {
    r.error(`La Cola virtual no respondió al gastar un turno: ${e}`);
    return { motivo: 'COLA_NO_DISPONIBLE' };
  }
  if (respuesta.status === 204) return { eventoId: respuesta.headers.get('X-Turno-Evento') };
  if (respuesta.status === 404) return { motivo: 'TURNO_INVALIDO' };
  // Sin Redis no hay fila: dejar pasar sería quitar justo la protección que la
  // cola es. Se falla cerrado.
  return { motivo: 'COLA_NO_DISPONIBLE' };
}

async function verificar(r) {
  const autorizacion = r.headersIn.Authorization || '';
  const partes = autorizacion.split(' ');
  const token = partes[1];
  if (partes.length !== 2 || partes[0] !== 'Bearer' || !token) return negar(r, 401, 'SIN_AUTENTICAR');

  let sesion;
  try {
    sesion = await sesionDe(token);
  } catch (e) {
    r.error(`No se pudo verificar un token: ${e}`);
    sesion = null;
  }
  if (!sesion) return negar(r, 401, 'SIN_AUTENTICAR');

  const requeridos = r.variables.roles_requeridos;
  if (requeridos && !requeridos.split(',').some((rol) => sesion.roles.includes(rol))) {
    return negar(r, 403, 'ROL_INSUFICIENTE');
  }

  if (r.variables.turno_requerido === '1') {
    const turno = await gastarTurno(r, autorizacion);
    if (turno.motivo) return negar(r, 403, turno.motivo);
    r.headersOut['X-Turno-Evento'] = turno.eventoId || '';
  }

  r.headersOut['X-Usuario-Id'] = sesion.usuarioId;
  r.headersOut['X-Usuario-Roles'] = sesion.roles.join(',');
  r.return(204);
}

export default { verificar };
