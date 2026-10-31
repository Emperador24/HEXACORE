# Gateway

API Gateway + balanceador de carga (SAD §8, ADR-02, ADR-15).

**Responsabilidad:** punto único de entrada al backend para las cuatro interfaces del sistema.
Centraliza autenticación, autorización, validación de tokens y enrutamiento hacia el microservicio
correspondiente; distribuye tráfico entre las réplicas de cada servicio.

**ASR relacionados:** ASR-02 (disponibilidad ante caída de una instancia), ASR-03 (protección de
datos de pago y credenciales).

**Responsable:** transversal al equipo. Primera versión: Samuel Emperador, junto con el CU-027.

**Estado:** en funcionamiento para los servicios que ya existen. Añadir un servicio nuevo es añadir
un `location`, y si exige sesión, incluir `autenticar.conf` en él.

## Qué hay aquí

| Archivo | Qué es |
|---|---|
| `nginx.conf` | Las rutas: a qué servicio va cada una y qué exige. |
| `autenticacion.js` | Valida el JWT con la clave pública, autoriza por rol y gasta el turno de la Cola virtual (njs). |
| `autenticar.conf` | Las líneas que cada ruta protegida incluye para pasar por `autenticacion.js`. |
| `nginx-principal.conf` | La configuración principal de Nginx: la de la imagen oficial más `load_module` del njs. |
| `pruebas/gateway.py` | Comprueba enrutamiento, autenticación previa (RNF-06), roles, turno, *webhook*, CORS, balanceo (RNF-10) y caída de una instancia (RNF-03). |

Se despliega desde `../infra/docker-compose.yml` (servicio `api-gateway`, imagen `nginx:1.27-alpine`)
y escucha en **8080**. Es la única dirección que conocen la app móvil y los portales.

## Cómo enruta

| Ruta | Servicio | Exige |
|---|---|---|
| `/api/v1/sesiones` (POST), `/sesiones/renovar`, `/cuentas/registro`, `/verificar`, `/recuperacion`, `/restablecer` | Autenticación | nada (son las que *dan* el token) |
| `/api/v1/cuentas/…`, `/api/v1/sesiones/…` | Autenticación | token |
| `/api/v1/admin/…` | Autenticación | token con rol `Administrador` |
| `/api/v1/cartelera` (solo GET) | Catálogo | nada |
| `/api/v1/cola/…` | Cola virtual | token |
| `POST /api/v1/compras` | Ventas | token `Cliente` **y turno** en `X-Turno-Cola` |
| `/api/v1/compras/…`, `GET /api/v1/compras` | Ventas | token `Cliente` |
| `/api/v1/ingresos…` | Acceso QR | token `Personal` o `Administrador` |
| `/api/v1/reventa/…` | Postventa | token `Cliente` o `Administrador` |
| `/api/v1/pedidos/…` | Alimentos | token |
| `/api/v1/logistica/…` | Eventos / Emergencias | token |
| `POST /api/v1/pagos/webhook` | Pagos | firma HMAC de la pasarela (la valida Pagos) |
| `/salud` | el propio gateway | nada |

Las rutas públicas van con coincidencia **exacta** (`location = …`), que en Nginx gana a cualquier
prefijo. Lo que no coincide con nada devuelve 404 con el mismo formato de error que el resto del
sistema. Las rutas `/interno/` de los servicios **no se enrutan**.

## Cómo autentica: el JWT se valida aquí (ADR-15)

Antes de enrutar una ruta protegida, Nginx hace una subpetición (`auth_request`) a `/_auth`, que
resuelve `autenticacion.js` **sin salir del gateway**: firma RS256 con la clave pública, emisor,
caducidad y forma del contenido, las mismas reglas que `App/shared/seguridad/token-sesion.md`. Si la
ruta declara `$roles_requeridos`, comprueba también el rol. Responde 204 con `X-Usuario-Id` y
`X-Usuario-Roles`, o 401/403 con el motivo en `X-Motivo`, que `nginx.conf` traduce a JSON.

Hasta ADR-15 el gateway le preguntaba a Autenticación (`/sesiones/verificar`) en cada petición. Eso
ponía al servicio que emite los tokens en el camino de todo el tráfico: si se caía o iba lento, se
caía o iba lento todo.

Dos consecuencias que importan:

- El gateway necesita la **clave pública** (se monta en `/etc/nginx/claves/jwt-publica.pem`), pero
  no Redis: **no comprueba si la sesión se cerró**. Eso lo siguen haciendo los servicios, así que un
  token de una sesión cerrada recibe igual un 401, solo que del servicio y no del gateway.
- Los servicios **siguen validando por su cuenta** (RNF-06). La cabecera `X-Usuario-Id` que añade el
  gateway no basta para entrar: si alguien alcanza un servicio directamente y la falsifica, recibe
  401 igual. Está comprobado en `pruebas/gateway.py`.

## El turno de la Cola virtual

`POST /api/v1/compras` exige la cabecera `X-Turno-Cola` con el token que da
`POST /api/v1/cola/eventos/{id}/turnos`. Tras validar el JWT, `autenticacion.js` lo **gasta** en la
Cola virtual (`DELETE /interno/cola/turnos/{token}`, con la sesión del comprador) y solo entonces
deja pasar la petición a Ventas:

| Caso | Respuesta |
|---|---|
| Sin `X-Turno-Cola` | 428 `TURNO_REQUERIDO` |
| Turno ya gastado, caducado o de otra cuenta | 403 `TURNO_INVALIDO` |
| La Cola virtual no responde | 503 `COLA_NO_DISPONIBLE` — se falla cerrado |

Así Ventas solo recibe a cuantos puede atender y no necesita llamar a la Cola.

## El *webhook* de la pasarela

`POST /api/v1/pagos/webhook` es la única ruta pública que no es de un usuario. No lleva JWT —la
pasarela no tiene sesión—; Pagos la autentica con la firma HMAC-SHA256 del cuerpo en
`X-Pasarela-Firma`. Nada más de Pagos se expone: cobrar y reembolsar siguen siendo internos.

## Balanceo y caída de una instancia

Los nombres de los servicios los resuelve el DNS interno de Docker **en cada petición**
(`resolver 127.0.0.11` + variable en `proxy_pass`), no solo al arrancar. Por eso al levantar réplicas
el gateway empieza a repartir sin reiniciarlo, y al caer una deja de usarla:

```bash
cd ../infra
docker compose -f docker-compose.yml -f docker-compose.escalado.yml \
  --profile servicios up -d --scale ventas=2
python3 ../gateway/pruebas/gateway.py
```

La cabecera `X-Servidor` de cada respuesta dice qué instancia contestó, que es lo que permite ver el
reparto en vivo. Con dos instancias, 20 peticiones se reparten ~11/9; matando una, las 20 siguen
respondiendo 200 (RNF-03).

## CORS

Vive aquí y no en cada servicio: los microservicios no hablan con navegadores, hablan con el gateway.
En desarrollo se aceptan los portales en 4200 y 4201 desde cualquier máquina de la red —para poder
abrirlos desde otro computador— y la comprobación previa (`OPTIONS`) se responde en el gateway sin
tocar ningún servicio. En producción esa lista se reduce a los dominios reales.

## Probarlo

```bash
cd ../infra && docker compose --profile servicios up -d
python3 ../gateway/pruebas/gateway.py
```

Necesita las cuentas de ejemplo (`cd ../services/autenticacion && npm run semilla`).
