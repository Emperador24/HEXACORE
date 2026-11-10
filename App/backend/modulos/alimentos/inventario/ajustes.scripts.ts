/** Un único campo, resultado durable por operación; validar todo antes de escribir. */
export const AJUSTAR_LUA = `
local function tipo(k) return redis.call('TYPE',k).ok end
local function respuesta(estado,codigo,antes,despues)
  return cjson.encode({estado=estado,codigo=codigo,antes=antes,despues=despues,huella=ARGV[1]})
end
if tipo(KEYS[3]) ~= 'none' and tipo(KEYS[3]) ~= 'string' then return respuesta('PENDIENTE','DATOS_INCONSISTENTES') end
local previo=redis.call('GET',KEYS[3])
if previo then
  local ok,p=pcall(cjson.decode,previo)
  if not ok or p.huella ~= ARGV[1] then return respuesta('PENDIENTE','OPERACION_INCOMPATIBLE') end
  -- Forzar offset de escritura en esta conexión para WAITAOF, sin repetir el delta.
  redis.call('SET',KEYS[3],previo)
  return previo
end
local delta=tonumber(ARGV[3])
if not delta or delta ~= math.floor(delta) or math.abs(delta)>2147483647 then return respuesta('PENDIENTE','DELTA_INVALIDO') end
local alta=ARGV[4]=='ALTA'
local inicia=alta and ARGV[5]=='1' and tipo(KEYS[1])=='none' and tipo(KEYS[2])=='none'
if not inicia and (tipo(KEYS[1])~='hash' or tipo(KEYS[2])~='string' or redis.call('GET',KEYS[2])~='1') then
  return respuesta('PENDIENTE','INVENTARIO_NO_PREPARADO')
end
local valor=redis.call('HGET',KEYS[1],ARGV[2])
if (alta and valor) or (not alta and not valor) then return respuesta('PENDIENTE','INVENTARIO_INCONSISTENTE') end
local antes=valor and tonumber(valor) or 0
if not antes or antes<0 or antes~=math.floor(antes) or antes>2147483647 then return respuesta('PENDIENTE','DATOS_INCONSISTENTES') end
local despues=antes+delta
if despues<0 or despues>2147483647 then
  local r=respuesta('RECHAZADA','EXISTENCIAS_COMPROMETIDAS',antes,antes)
  redis.call('SET',KEYS[3],r)
  return r
end
local r=respuesta('APLICADA','OK',antes,despues)
if alta then redis.call('HSET',KEYS[1],ARGV[2],despues)
else redis.call('HINCRBY',KEYS[1],ARGV[2],delta) end
if inicia then redis.call('SET',KEYS[2],'1') end
redis.call('SET',KEYS[3],r)
return r
`;
