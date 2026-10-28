/**
 * Los dos guiones Lua de la fila.
 *
 * Van en Lua y no en varias órdenes seguidas porque Redis ejecuta un guion
 * entero sin que nada se cuele en medio. Con tres réplicas de este servicio
 * (ADR-14) atendiendo el mismo pico, hacer "mirar cuántos hay dentro" y
 * "meter a uno más" en dos viajes dejaría pasar de más: dos instancias leerían
 * 99 y las dos admitirían. Eso es exactamente el aforo que la cola existe para
 * respetar.
 */

/**
 * Pedir turno.
 *
 * KEYS[1] conjunto de admitidos  (member = token, score = cuándo caduca)
 * KEYS[2] fila de espera         (member = solicitud, score = cuándo llegó)
 * KEYS[3] turno vigente por usuario (hash: solicitud -> token)
 * ARGV[1] ahora, en ms
 * ARGV[2] aforo concurrente
 * ARGV[3] id de la solicitud (evento:usuario)
 * ARGV[4] token a entregar si hay sitio
 * ARGV[5] vida del turno, en ms
 * ARGV[6] vida de la espera, en ms
 *
 * Hacen falta las tres claves porque se busca de dos maneras: Ventas gasta el
 * turno **por token**, y aquí hay que saber si **este usuario** ya tiene uno.
 * Con una sola estructura una de las dos búsquedas sale mal — y la que salía
 * mal era esta: dar turno dos veces al mismo comprador, que es justo lo que
 * rompe el aforo.
 */
export const PEDIR_TURNO = `
local ahora = tonumber(ARGV[1])
local aforo = tonumber(ARGV[2])
local solicitud = ARGV[3]
local token = ARGV[4]
local turnoMs = tonumber(ARGV[5])
local esperaMs = tonumber(ARGV[6])

-- Caducar antes de contar: un turno vencido ya no ocupa sitio, y quien dejó de
-- preguntar tampoco guarda la vez.
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', ahora)
redis.call('ZREMRANGEBYSCORE', KEYS[2], '-inf', ahora - esperaMs)

-- ¿Este usuario ya tiene turno vivo? Entonces se le devuelve el mismo: pedir
-- dos veces no puede dar dos sitios.
local suToken = redis.call('HGET', KEYS[3], solicitud)
if suToken then
  local expira = redis.call('ZSCORE', KEYS[1], suToken)
  if expira then
    return cjson.encode({ estado = 'ADMITIDO', token = suToken, expiraEn = tonumber(expira), repetida = true })
  end
  -- Su turno caducó o ya lo gastó: la referencia sobra. Se limpia aquí en vez
  -- de al consumir, que no sabe de qué usuario era.
  redis.call('HDEL', KEYS[3], solicitud)
end

local dentro = redis.call('ZCARD', KEYS[1])
local enEspera = redis.call('ZSCORE', KEYS[2], solicitud)

if dentro < aforo then
  if enEspera then redis.call('ZREM', KEYS[2], solicitud) end
  local expira = ahora + turnoMs
  redis.call('ZADD', KEYS[1], expira, token)
  redis.call('HSET', KEYS[3], solicitud, token)
  redis.call('PEXPIRE', KEYS[1], turnoMs * 2)
  redis.call('PEXPIRE', KEYS[3], turnoMs * 2)
  return cjson.encode({ estado = 'ADMITIDO', token = token, expiraEn = expira, repetida = false })
end

-- No hay sitio. Se conserva el momento de llegada: volver a preguntar no
-- manda al final de la fila, que sería castigar a quien espera bien.
if not enEspera then
  redis.call('ZADD', KEYS[2], ahora, solicitud)
end
redis.call('PEXPIRE', KEYS[2], esperaMs * 4)

local posicion = redis.call('ZRANK', KEYS[2], solicitud)
return cjson.encode({
  estado = 'EN_ESPERA',
  posicion = (posicion or 0) + 1,
  enFila = redis.call('ZCARD', KEYS[2]),
})
`;

/**
 * Consumir un turno. Lo llama Ventas antes de dejar entrar al checkout.
 *
 * Es de un solo uso: `ZREM` devuelve cuántos quitó, así que dos peticiones con
 * el mismo token no pueden ganar las dos. Sin eso, un token filtrado serviría
 * para colarse tantas veces como quisiera.
 *
 * KEYS[1] conjunto de admitidos
 * ARGV[1] ahora, en ms
 * ARGV[2] token
 */
export const CONSUMIR_TURNO = `
local ahora = tonumber(ARGV[1])
local token = ARGV[2]

redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', ahora)

local expira = redis.call('ZSCORE', KEYS[1], token)
if not expira then
  return cjson.encode({ codigo = 'TURNO_INVALIDO' })
end
if redis.call('ZREM', KEYS[1], token) == 0 then
  -- Otro se lo llevó entre el ZSCORE y el ZREM. No puede pasar dentro de un
  -- guion, pero se comprueba igual: la alternativa es admitir dos veces.
  return cjson.encode({ codigo = 'TURNO_INVALIDO' })
end
return cjson.encode({ codigo = 'OK', expiraba = tonumber(expira) })
`;
