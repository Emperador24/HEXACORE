# Gateway

API Gateway + balanceador de carga (SAD §8, ADR-02).

**Responsabilidad:** punto único de entrada al backend para las cuatro interfaces del sistema.
Centraliza autenticación, autorización, validación de tokens y enrutamiento hacia el microservicio
correspondiente; distribuye tráfico entre las réplicas de cada servicio.

**ASR relacionados:** ASR-02 (disponibilidad ante caída de una instancia), ASR-03 (protección de
datos de pago y credenciales).

**Responsable:** transversal al equipo. Primera versión: Samuel Emperador, junto con el CU-027.

**Estado:** en funcionamiento para los servicios que ya existen —Administración (CU-027) y Entradas
y Mercado Secundario (CU-006)—. Añadir un servicio nuevo es añadir un `location`.

## Qué hay aquí

| Archivo | Qué es |
|---|---|
| `nginx.conf` | La configuración completa. Es el gateway: no hay código propio. |
| `pruebas/gateway.py` | Comprueba enrutamiento, autenticación previa (RNF-06), CORS, balanceo (RNF-10) y caída de una instancia (RNF-03). |

Se despliega desde `../infra/docker-compose.yml` (servicio `api-gateway`, imagen `nginx:1.27-alpine`)
y escucha en **8080**. Es la única dirección que conocen la app móvil y los portales.

## Cómo enruta

| Ruta | Servicio | ¿Token? |
|---|---|---|
| `/api/v1/sesiones` (POST), `/api/v1/sesiones/renovar` | Administración | no (son las que *dan* el token) |
| `/api/v1/cuentas/registro`, `/verificar`, `/recuperacion`, `/restablecer` | Administración | no (CU-027 pasos 1-7 y CU-027A) |
| `/api/v1/cuentas/…` (perfil, contraseña) | Administración | sí |
| `/api/v1/sesiones/…` (sesión actual, cierre) | Administración | sí |
| `/api/v1/admin/…` | Administración | sí (y el servicio exige rol Administrador) |
| `/api/v1/reventa/…` | Entradas y Mercado Secundario | sí |
| `/api/v1/salud`, `/salud` | sondas | no |

Las rutas públicas van con coincidencia **exacta** (`location = …`), que en Nginx gana a cualquier
prefijo. Así `/api/v1/sesiones` (login) es pública y `/api/v1/sesiones/actual` no lo es, sin que una
regla se coma a la otra. Lo que no coincide con nada devuelve 404 con el mismo formato de error que
el resto del sistema.

## Cómo autentica sin tener las claves

Antes de enrutar una ruta protegida, Nginx hace una subpetición (`auth_request`) a
`GET /api/v1/sesiones/verificar` del Servicio de Administración, que comprueba la firma RS256, la
expiración y que la sesión no esté cerrada; responde **204** con `X-Usuario-Id` y `X-Usuario-Roles`,
o **401**. El gateway solo reenvía si dijo 204, y pasa esas dos cabeceras al servicio de destino.

Dos consecuencias que importan:

- El gateway **no necesita la clave pública ni Redis**: quien emite los tokens es quien los valida.
- Los microservicios **siguen validando por su cuenta** (RNF-06). La cabecera `X-Usuario-Id` que
  añade el gateway no basta para entrar: si alguien alcanza un servicio directamente y la falsifica,
  recibe 401 igual. Está comprobado en `pruebas/gateway.py`.

## Balanceo y caída de una instancia

Los nombres de los servicios los resuelve el DNS interno de Docker **en cada petición**
(`resolver 127.0.0.11` + variable en `proxy_pass`), no solo al arrancar. Por eso al levantar réplicas
el gateway empieza a repartir sin reiniciarlo, y al caer una deja de usarla:

```bash
cd ../infra
docker compose -f docker-compose.yml -f docker-compose.escalado.yml \
  --profile servicios up -d --scale entradas-mercado-secundario=2
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

Necesita las cuentas de ejemplo (`cd ../services/administracion && npm run semilla`).
