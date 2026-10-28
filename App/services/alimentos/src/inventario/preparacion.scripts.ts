/** Preparación administrativa, con compras detenidas. Solo para el volumen del prototipo.
 * KEYS: stock del establecimiento, marca de preparado, zset global de vencimientos.
 * ARGV: establecimientoId, [{productoId,cantidadInventario}]. No modifica datos existentes.
 */
export const PREPARAR_INVENTARIO_LUA = `
local function respuesta(codigo) return cjson.encode({codigo=codigo}) end
if redis.call('EXISTS', KEYS[1], KEYS[2]) > 0 then return respuesta('INVENTARIO_YA_EXISTENTE') end
local tipoIndice = redis.call('TYPE', KEYS[3]).ok
if tipoIndice ~= 'none' and tipoIndice ~= 'zset' then return respuesta('DATOS_INCONSISTENTES') end
local ok, productos = pcall(cjson.decode, ARGV[2])
if not ok or type(productos) ~= 'table' or #productos == 0 then return respuesta('PRODUCTOS_INVALIDOS') end
local vistos = {}
for _, p in ipairs(productos) do
  if type(p) ~= 'table' or type(p.productoId) ~= 'string' or p.productoId == '' or vistos[p.productoId] or
     type(p.cantidadInventario) ~= 'number' or p.cantidadInventario < 0 or p.cantidadInventario > 2147483647 or
     p.cantidadInventario ~= math.floor(p.cantidadInventario) then return respuesta('PRODUCTOS_INVALIDOS') end
  vistos[p.productoId] = true
end
-- No basta comprobar stock/marca: una pérdida parcial puede dejar reservas huérfanas.
-- El recorrido del namespace es intencionalmente administrativo, sin tráfico concurrente.
local cursor = '0'
repeat
  local lote = redis.call('SCAN', cursor, 'MATCH', 'pedidos:inv:{inventario}:reserva:*', 'COUNT', 100)
  cursor = lote[1]
  for _, clave in ipairs(lote[2]) do
    if redis.call('TYPE', clave).ok ~= 'hash' then return respuesta('DATOS_INCONSISTENTES') end
    local establecimiento = redis.call('HGET', clave, 'establecimientoId')
    if not establecimiento then return respuesta('DATOS_INCONSISTENTES') end
    if establecimiento == ARGV[1] then return respuesta('INVENTARIO_YA_EXISTENTE') end
  end
until cursor == '0'
-- Una entrada sin reserva no se puede atribuir con seguridad a un establecimiento.
for _, pedidoId in ipairs(redis.call('ZRANGE', KEYS[3], 0, -1)) do
  local clave = 'pedidos:inv:{inventario}:reserva:' .. pedidoId
  if redis.call('TYPE', clave).ok ~= 'hash' or not redis.call('HGET', clave, 'establecimientoId') then
    return respuesta('DATOS_INCONSISTENTES')
  end
end
-- Todas las validaciones preceden a la primera escritura: Lua no hace rollback ante errores.
for _, p in ipairs(productos) do
  redis.call('HSET', KEYS[1], p.productoId, string.format('%.0f', p.cantidadInventario))
end
redis.call('SET', KEYS[2], '1')
return respuesta('OK')
`;
