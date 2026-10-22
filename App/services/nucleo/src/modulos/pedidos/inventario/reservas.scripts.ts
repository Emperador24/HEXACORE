/** Lua embebido para que tsc/Nest lo distribuyan sin copiar assets ni cambiar el build.
 * KEYS: hash de disponibles del establecimiento, reserva GLOBAL por pedido, zset de vencimientos, marca de preparado.
 * Una misma etiqueta {inventario} permite atomicidad y unicidad global incluso entre establecimientos.
 * Ningún script expira claves. No hay rollback en Lua: validar antes de cualquier escritura.
 */
const COMUN = `
local function respuesta(codigo, estado, expira, repetida)
  return cjson.encode({codigo=codigo, estado=estado, expiraEn=expira, repetida=repetida})
end
local function tipo(clave) return redis.call('TYPE', clave).ok end
local function entero(valor)
  local n = tonumber(valor)
  if not n or n < 0 or n > 2147483647 or n ~= math.floor(n) then return nil end
  -- HINCRBY exige un entero decimal, no notación exponencial ni decimales.
  if type(valor) == 'string' and valor ~= '0' and not string.match(valor, '^[1-9]%d*$') then return nil end
  return n
end
local function productosValidos(json)
  local ok, productos = pcall(cjson.decode, json)
  if not ok or type(productos) ~= 'table' or #productos == 0 then return nil end
  local vistos = {}
  for _, p in ipairs(productos) do
    if type(p) ~= 'table' or type(p.productoId) ~= 'string' or p.productoId == '' or
      type(p.cantidad) ~= 'number' or not entero(p.cantidad) or p.cantidad == 0 or vistos[p.productoId] then return nil end
    vistos[p.productoId] = true
  end
  return productos
end
if tipo(KEYS[2]) ~= 'none' and tipo(KEYS[2]) ~= 'hash' then return respuesta('DATOS_INCONSISTENTES') end
if tipo(KEYS[3]) ~= 'none' and tipo(KEYS[3]) ~= 'zset' then return respuesta('DATOS_INCONSISTENTES') end
`;

export const RESERVAR_LUA = COMUN + `
-- ARGV: establecimientoId, pedidoId, productos canónicos, expiraEn (epoch ms).
local productos = productosValidos(ARGV[3])
local expira = tonumber(ARGV[4])
if not productos or not expira or expira ~= math.floor(expira) or expira <= 0 then return respuesta('ENTRADA_INVALIDA') end
local existe = redis.call('EXISTS', KEYS[2]) == 1
if existe and (redis.call('HGET', KEYS[2], 'establecimientoId') ~= ARGV[1] or
   redis.call('HGET', KEYS[2], 'productos') ~= ARGV[3]) then return respuesta('RESERVA_INCOMPATIBLE') end
if tipo(KEYS[4]) == 'none' or tipo(KEYS[1]) == 'none' then return respuesta('INVENTARIO_NO_PREPARADO') end
if tipo(KEYS[4]) ~= 'string' or tipo(KEYS[1]) ~= 'hash' then return respuesta('DATOS_INCONSISTENTES') end
if redis.call('GET', KEYS[4]) ~= '1' then return respuesta('INVENTARIO_NO_PREPARADO') end
-- Exigir marca y todos los campos incluso al repetir una reserva. Nunca reparar aquí.
local disponibles = {}
for _, p in ipairs(productos) do
  local valor = redis.call('HGET', KEYS[1], p.productoId)
  if not valor then return respuesta('INVENTARIO_NO_PREPARADO') end
  local cantidad = entero(valor)
  if not cantidad then return respuesta('DATOS_INCONSISTENTES') end
  disponibles[p.productoId] = cantidad
end
if existe then
  local estado = redis.call('HGET', KEYS[2], 'estado')
  local original = tonumber(redis.call('HGET', KEYS[2], 'expiraEn'))
  if not original or (estado ~= 'ACTIVA' and estado ~= 'LIBERADA' and estado ~= 'CONSUMIDA') then return respuesta('DATOS_INCONSISTENTES') end
  -- Repetir NO reactiva una reserva cerrada ni renueva el vencimiento original.
  return respuesta('OK', estado, original, true)
end
local reloj = redis.call('TIME')
local ahora = tonumber(reloj[1]) * 1000 + math.floor(tonumber(reloj[2]) / 1000)
if expira <= ahora then return respuesta('VENCIMIENTO_INVALIDO') end
for _, p in ipairs(productos) do
  if disponibles[p.productoId] < p.cantidad then return respuesta('INVENTARIO_INSUFICIENTE') end
end
for _, p in ipairs(productos) do redis.call('HINCRBY', KEYS[1], p.productoId, -p.cantidad) end
redis.call('HSET', KEYS[2], 'establecimientoId', ARGV[1], 'productos', ARGV[3], 'estado', 'ACTIVA', 'expiraEn', ARGV[4])
redis.call('ZADD', KEYS[3], expira, ARGV[2])
return respuesta('OK', 'ACTIVA', expira, false)
`;

/** ARGV: establecimientoId, pedidoId, destino (LIBERADA o CONSUMIDA). */
export const CERRAR_LUA = COMUN + `
local destino = ARGV[3]
if destino ~= 'LIBERADA' and destino ~= 'CONSUMIDA' then return respuesta('ENTRADA_INVALIDA') end
if redis.call('EXISTS', KEYS[2]) == 0 then return respuesta('RESERVA_NO_ENCONTRADA') end
if redis.call('HGET', KEYS[2], 'establecimientoId') ~= ARGV[1] then return respuesta('RESERVA_INCOMPATIBLE') end
local estado = redis.call('HGET', KEYS[2], 'estado')
local expira = tonumber(redis.call('HGET', KEYS[2], 'expiraEn'))
if not expira then return respuesta('DATOS_INCONSISTENTES') end
if estado == destino then return respuesta('OK', estado, expira, true) end
if estado == 'LIBERADA' or estado == 'CONSUMIDA' then return respuesta('RESERVA_CERRADA') end
if estado ~= 'ACTIVA' then return respuesta('DATOS_INCONSISTENTES') end
local productos = productosValidos(redis.call('HGET', KEYS[2], 'productos') or '')
if not productos then return respuesta('DATOS_INCONSISTENTES') end
if destino == 'LIBERADA' then
  if tipo(KEYS[1]) == 'none' then return respuesta('INVENTARIO_NO_PREPARADO') end
  if tipo(KEYS[1]) ~= 'hash' then return respuesta('DATOS_INCONSISTENTES') end
  -- Comprobar todos los contadores antes de devolver la primera unidad.
  for _, p in ipairs(productos) do
    local valor = redis.call('HGET', KEYS[1], p.productoId)
    if not valor then return respuesta('INVENTARIO_NO_PREPARADO') end
    local disponibles = entero(valor)
    if not disponibles or disponibles + p.cantidad > 2147483647 then return respuesta('DATOS_INCONSISTENTES') end
  end
  for _, p in ipairs(productos) do redis.call('HINCRBY', KEYS[1], p.productoId, p.cantidad) end
end
redis.call('HSET', KEYS[2], 'estado', destino)
redis.call('ZREM', KEYS[3], ARGV[2])
return respuesta('OK', destino, expira, false)
`;
