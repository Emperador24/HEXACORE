# Contrato: token de sesión

Lo emite el **Servicio de Administración** (CU-027, paso 9) y lo exige todo microservicio con
endpoints de negocio (RNF-06). Este documento es lo que los servicios tienen que acordar; cambiar
cualquiera de estos puntos en un lado sin cambiarlo en el otro rompe la autenticación o, peor, la
debilita sin que nadie lo note.

## Transporte

`Authorization: Bearer <token>`. Nada más: ni cookies, ni parámetros de URL (un token en la URL
acaba en logs, historial y cabeceras `Referer`).

## Formato

JWT firmado con **RS256**.

| Campo | Contenido |
|---|---|
| `alg` (cabecera) | `RS256`. **Los verificadores deben fijarlo**: aceptar el que declare el token abre la puerta a `alg: none` y a un HS256 "firmado" con la clave pública. |
| `iss` | `hexacore-administracion`. Se comprueba. |
| `sub` | UUID del usuario. Es el mismo identificador que aparece como `propietario_id`, `vendedor_id`, etc. en las demás bases (ADR-01). |
| `roles` | Nombres de rol (CU-028): `Cliente`, `Personal`, `Organizador`, `Administrador`. |
| `jti` | UUID **de la sesión**, no del token: es el mismo en todas sus renovaciones. Sirve para revocarla. |
| `iat`, `exp` | Emisión y caducidad (**15 min** por defecto; máximo 60). |

**No lleva datos personales** (ni nombre ni correo): un JWT se firma, no se cifra, y cualquiera que
lo intercepte puede leerlo.

## Renovación

El token de acceso es corto. Las sesiones largas se mantienen con un **token de renovación** que
solo conoce el cliente y que **solo se envía a Administración** (`POST /sesiones/renovar`). Los
demás servicios no lo ven ni lo necesitan: solo reciben tokens de acceso, cada vez con un `exp`
nuevo y el mismo `jti`.

**Clientes web:** con la cabecera `X-Hexacore-Cliente: web`, el token de renovación no va en el
cuerpo sino en una cookie `hxc_renovacion` (`HttpOnly`, `SameSite=Strict`,
`Path=/api/v1/sesiones`), y el portal guarda el token de acceso solo en memoria. Ver
`services/administracion/DECISIONES.md` §22.

Consecuencia para los verificadores: un cambio de roles llega como mucho cuando caduca el token de
acceso vigente (15 minutos). Si una operación no puede esperar tanto, debe consultar los roles a
Administración, como hace su propia administración de cuentas.

## Claves

- **Privada:** solo la tiene el Servicio de Administración (`AUTH_JWT_CLAVE_PRIVADA_ARCHIVO`).
- **Pública:** la reciben los demás (`AUTH_JWT_CLAVE_PUBLICA_ARCHIVO`). Solo sirve para verificar,
  así que un servicio comprometido no puede fabricar tokens.
- En desarrollo se usan las de `infra/claves-desarrollo/`, que **están en el repositorio**. Todos los
  servicios deben negarse a arrancar en producción con ellas; se reconocen por la huella SHA-256 de la
  pública: `f696ee0f606b5a5f16ba37f8f0628b0f7c94dd08e6ba34de463f33dfe6266f5d`.

## Revocación (Redis, ADR-03)

Un JWT no se puede invalidar antes de que caduque. Para que cerrar sesión funcione en todo el
sistema, Administración publica cada sesión cerrada en Redis:

```
clave:  sesion-revocada:<jti>
valor:  1
vida:   lo que le queda al último token de acceso de la sesión + 60 s (relojes desfasados)
```

Cada servicio, **después** de verificar la firma, comprueba `EXISTS sesion-revocada:<jti>`:

- existe → `401`;
- Redis no responde → `503`. **No se acepta** un token cuya revocación no se puede comprobar.

Se publica al cerrar sesión, al cambiar o restablecer la contraseña (se cierran las demás sesiones),
al bloquearse una cuenta desde una sesión (CU-027D) y al resembrar la base de desarrollo. Al arrancar,
Administración vuelve a publicar todas las revocaciones vigentes por si Redis perdió sus datos.

**Nadie debe hacer `FLUSHALL`** sobre el Redis compartido: reabriría las sesiones cerradas. Cada
servicio limpia solo sus propias claves (`reventa:*`, por ejemplo).

## El API Gateway valida antes, y no sustituye a nadie

Todo el tráfico de los clientes entra por el **API Gateway** (ADR-02, `App/gateway/`). Antes de
enrutar una ruta protegida, el gateway pregunta a `GET /api/v1/sesiones/verificar` del Servicio de
Administración, que aplica exactamente estas mismas reglas y responde:

| Respuesta | Cabeceras | Significa |
|---|---|---|
| `204 No Content` | `X-Usuario-Id`, `X-Usuario-Roles` (separados por coma) | Token válido y sesión abierta |
| `401` | — | Cualquier otro caso |

El gateway reenvía la petición solo tras un 204, y añade esas dos cabeceras. **Un servicio no debe
confiar en ellas**: son una comodidad para trazas y logs, no una credencial. Cada servicio sigue
verificando el `Authorization: Bearer` por su cuenta (RNF-06), porque un atacante dentro de la red
puede llamar al servicio directamente y poner la cabecera que quiera. Comprobado en
`App/gateway/pruebas/gateway.py`.

## Respuestas de error

| Código | `codigo` | Cuándo |
|---|---|---|
| 401 | `SIN_AUTENTICAR` | Sin token, firma inválida, caducado, otro emisor, malformado o revocado |
| 403 | `ROL_INSUFICIENTE` | Token válido, pero su rol no permite la operación |
| 503 | `SESIONES_NO_DISPONIBLES` | No se pudo consultar la revocación |

## Implementaciones

- Emisión: `services/administracion/src/sesiones/`
- Verificación: `services/entradas-mercado-secundario/src/comun/autenticacion/sesion-valida.guard.ts`
- Prueba entre servicios: `services/entradas-mercado-secundario/pruebas/rnf06-autenticacion.py`
- Validación en el borde: `gateway/nginx.conf` (`auth_request`) y `gateway/pruebas/gateway.py`
