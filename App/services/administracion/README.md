# Servicio de Administración

CU-027–CU-032. **NestJS** (ADR-09) + **PostgreSQL** (ADR-01, ADR-06).

**Responsabilidad:** cuentas de usuario, roles y permisos, recintos y zonas (CU-027–029);
proveedores, pagos/conciliación financiera, y reportes y analítica (CU-030–032).

Es lo que el CU-027 llama *"servicio de autenticación centralizado (Auth Service) detrás del API
Gateway"*: **emite los tokens de sesión que el resto de microservicios exigen**, y es la única fuente
de verdad sobre quién es quién. Si este servicio cae, nadie entra a ninguna parte — de ahí que el
CU-027 marque la Disponibilidad como atributo de calidad (*"el login es crítico y debe responder
incluso en horas pico"*).

**Entidades del dominio (SAD §12):** Usuario, Rol, UsuarioRol, Proveedor, Pago, Reporte.

**Responsables:** Sebastián Sánchez (CU-027–029), Diego Coronado (CU-030–032).
CU-027 y CU-028 los implementa Samuel Emperador por acuerdo del equipo.

**Base de datos:** PostgreSQL para Usuario/Rol/UsuarioRol/Proveedor/Pago; MongoDB para Reporte
(polyglot persistence, SAD §12).

## Cómo levantarlo

```bash
# 1. Infraestructura compartida (la misma que usa el resto de servicios)
docker compose -f ../../infra/docker-compose.yml up -d

# 2. Este servicio
npm install
cp .env.example .env
npm run start:dev
```

O en contenedor, con reinicio automático si el proceso muere (RNF-04). Usa el mismo puerto, así
que antes hay que parar el de `npm`:

```bash
docker compose -f ../../infra/docker-compose.yml --profile servicios up -d --build
```

- API: <http://localhost:3002/api/v1>
- Documentación OpenAPI: <http://localhost:3002/api/v1/docs> (solo fuera de producción)
- Sonda de vida: <http://localhost:3002/api/v1/salud>

Convive con el servicio de Entradas, que usa el 3001.

**Los clientes no usan este puerto.** La app móvil y los portales entran por el **API Gateway**
(<http://localhost:8080/api/v1>, ADR-02), que autentica y enruta. El 3002 queda para las pruebas de
este servicio y para desarrollar con recarga en caliente; en producción no se publica. Ver
`App/gateway/README.md`.

## Datos para probar

Dos cosas distintas, y conviene no confundirlas:

```bash
npm run semilla                    # 13 cuentas con nombre y propósito (Ana, Bruno, el admin…)
npm run carga                      # 200 cuentas anónimas, con roles y estados repartidos
npm run carga -- --usuarios 1000   # más volumen (se suma a lo que ya haya)
npm run carga -- --limpiar         # borra solo las de la carga
```

La **semilla** existe para los escenarios: cada cuenta tiene un papel y las
pruebas la nombran. La **carga** existe para el volumen: listados, paginación,
filtros por rol y estado, y medir con datos que se parezcan a los de verdad.

El reparto imita a un sistema real —70 % clientes, 20 % personal, 7 %
organizadores, 3 % administradores— e incluye a propósito cuentas que **no
pueden entrar**: sin verificar, desactivadas y bloqueadas por intentos fallidos
(CU-027D). Contraseña de todas: `carga2026`.

**El orden importa:** `npm run semilla` hace `TRUNCATE` de `usuarios` y
`iniciar.sh` la corre en cada arranque. Se levanta el sistema primero y se carga
después.

Para darle ficha de empleado y turno a las cuentas de Personal que crea la
carga: `cd ../eventos-emergencias && npm run carga`.

## Estado de implementación

| Paso | Alcance | Estado |
|---|---|---|
| 1 | Andamiaje y configuración de seguridad validada | ✅ |
| 2 | Modelo de datos, migración y semilla | ✅ |
| 3 | Registro — CU-027 pasos 1–4 | ✅ |
| 4 | Verificación por correo — CU-027 pasos 5–7, excepción CU-027E | ✅ |
| 5 | Login y token de sesión — CU-027 pasos 8–9, alterno CU-027D | ✅ |
| 6 | Recuperación de contraseña y perfil — CU-027A, CU-027C | ✅ |
| 7 | Integración con el CU-006: el token sustituye a `X-Usuario-Id` | ✅ |
| 8 | Login real en la app móvil (`App/frontend/app-movil`) | ✅ |
| 9 | Administración de cuentas — activar, desactivar (CU-027B) y eliminar | ✅ |
| 10 | Renovación de sesiones — acceso de 15 min, renovación de 30 días sin uso | ✅ |
| 11 | Login real en el portal web de clientes; token de renovación en cookie `HttpOnly` | ✅ |
| 12 | API Gateway (ADR-02): punto único de entrada, autenticación centralizada y balanceo | ✅ |

CU-029–032 pertenecen a este dominio y se añadirán como módulos hermanos.

## Modelo de datos

| Tabla | Origen | Para qué |
|---|---|---|
| `usuarios` | SAD §12 | La cuenta: correo, hash, estado, contador de intentos fallidos |
| `roles` | SAD §12 | Cliente, Personal, Organizador, Administrador |
| `usuarios_roles` | SAD §12 | Asignación N:N — una persona puede ser Personal y Administrador |
| `sesiones` | **nueva** | El paso 9 pide *"registra el inicio de sesión"* |
| `tokens_cuenta` | **nueva** | Los enlaces de verificación (paso 5) y recuperación (CU-027A) |

```bash
npm run migracion:correr   # crea el esquema Y los cuatro roles de base
npm run semilla            # 7 cuentas de demostración
```

**Los roles los crea la migración, no la semilla.** Sin el rol `Cliente`, el paso 4 del CU-027 no
puede asignar el rol por defecto y el registro queda inutilizable: son parte del esquema, no datos
de prueba.

### Dos cosas que esta base NO guarda

**La contraseña.** La columna `hash_contrasena` guarda el resultado de `scrypt` con su salt, en el
formato `scrypt$N$r$p$<salt>$<hash>`. Los parámetros van dentro para poder subir el coste más
adelante sin invalidar las contraseñas existentes.

**El token de sesión ni los enlaces por correo.** De la sesión se guarda su identificador (`jti`),
que basta para revocarla; del enlace, su SHA-256. Ambos son credenciales vivas: guardarlos en claro
significaría que leer esta tabla permite suplantar a quien tenga la sesión abierta o entrar en las
cuentas con un enlace de recuperación pendiente. Hay un `CHECK` que exige que el hash tenga
exactamente 64 caracteres hexadecimales — si alguien guardara ahí un token en claro, la inserción
falla.

### Lo que la base impide por sí sola

| Regla | Mecanismo |
|---|---|
| Dos cuentas con el mismo correo, aunque cambie una mayúscula | `CHECK (email = lower(email))` + índice único |
| Una cuenta `ACTIVA` sin haber verificado el correo | `CHECK` de coherencia estado ↔ `verificado_en` |
| Eliminar un rol que tiene usuarios (CU-028A) | Llave foránea `RESTRICT` |
| Asignar dos veces el mismo rol a la misma persona | Clave primaria compuesta |
| Una sesión que caduca antes de emitirse | `CHECK (expira_en > emitida_en)` |
| Guardar un token de enlace en claro | `CHECK (hash_token ~ '^[0-9a-f]{64}$')` |

### Los identificadores cuadran con el servicio de Entradas

Ana, Bruno y Carla llevan **los mismos UUID** que la semilla de
`entradas-mercado-secundario`, donde aparecen como `propietario_id` y `vendedor_id`. Es
imprescindible: ADR-01 prohíbe las llaves foráneas entre bases de microservicios, así que la
coherencia entre dominios la sostiene el acuerdo sobre los identificadores, no el motor.

```
a0000001-…  Ana Gómez <cliente@hexacore.com>    dueña de TCK-2026-000001
a0000002-…  Bruno Díaz <bruno@hexacore.com>
a0000003-…  Carla Ruiz <carla@hexacore.com>
```

## Endpoints

| Método | Ruta | CU-027 |
|---|---|---|
| `POST` | `/cuentas/registro` | Pasos 1–4 — validar, comprobar, cifrar y crear con rol Cliente |
| `POST` | `/cuentas/verificar` | Pasos 6–7 — confirmar con el enlace y activar la cuenta |
| `POST` | `/sesiones` | Pasos 8–9 y CU-027D — iniciar sesión, emitir token, registrar el acceso |
| `POST` | `/sesiones/renovar` | Token de acceso nuevo con el de renovación; rota este último |
| `GET` | `/sesiones/actual` | Datos de la cuenta del token (requiere `Authorization: Bearer`) |
| `DELETE` | `/sesiones/actual` | Cerrar sesión: revoca el token en el servidor |
| `GET` | `/sesiones/verificar` | Para el API Gateway: 204 con `X-Usuario-Id`/`X-Usuario-Roles`, o 401 |
| `POST` | `/cuentas/recuperacion` | CU-027A — pedir un enlace para restablecer la contraseña |
| `POST` | `/cuentas/restablecer` | CU-027A — usar el enlace y elegir contraseña nueva |
| `GET` | `/cuentas/perfil` | CU-027C — ver el propio perfil (requiere sesión) |
| `PATCH` | `/cuentas/perfil` | CU-027C — editar el nombre, validado antes de guardar |
| `PUT` | `/cuentas/perfil/contrasena` | CU-027C — cambiar la contraseña pidiendo la actual |
| `GET` | `/admin/cuentas` | Buscar cuentas por nombre, correo y estado (solo Administrador) |
| `GET` | `/admin/cuentas/:id` | Detalle con su historial de administración |
| `POST` | `/admin/cuentas/:id/activar` | Activar una pendiente, o reactivar una desactivada (CU-027B) |
| `POST` | `/admin/cuentas/:id/desactivar` | CU-027B — desactivar y cerrar todas sus sesiones (motivo obligatorio) |
| `DELETE` | `/admin/cuentas/:id` | Eliminar: anonimizar la cuenta (motivo obligatorio) |

### El registro no dice si un correo existe

Responde `202 Accepted` con el mismo mensaje **exista o no la cuenta**. El CU-027 lo exige en su
atributo de Usabilidad: si dijera *"ese correo ya está registrado"*, el formulario serviría para
averiguar quién tiene cuenta probando correos uno a uno.

Eso explica dos decisiones que parecen desperdicio y no lo son:

- **Se cifra la contraseña aunque el correo ya exista.** `scrypt` tarda ~100 ms a propósito; si solo
  se cifrara cuando está libre, el tiempo de respuesta delataría lo que el mensaje calla.
  Medido: **51,3 ms frente a 52,1 ms**.
- **La fortaleza se valida antes de mirar el correo.** Al revés, el orden de los errores filtraría lo
  mismo.

Es `202` y no `201` porque la cuenta todavía no sirve: nace `PENDIENTE_VERIFICACION` y no puede
iniciar sesión hasta los pasos 5–7.

### El correo de verificación va por la cola

El CU-027 lo pide en su infraestructura: *"cola de mensajes para el envío asíncrono de correos"*. El
registro responde en cuanto la cuenta está creada; el correo sale después, con reintentos propios.

Si el envío fuera parte de la petición, un proveedor lento la alargaría y uno caído **haría fallar el
registro** — se perdería el alta por un correo, con la cuenta ya bien creada.

**CU-027E distingue dos fallos**, y la diferencia importa:

| Respuesta del proveedor | Qué significa | Qué se hace |
|---|---|---|
| **5xx** o sin respuesta | Está caído o sobrecargado | Se reintenta hasta 3 veces |
| **4xx** | La dirección no existe, el mensaje es inválido | A la DLQ, **sin reintentar** |

Sin esa distinción, una dirección inexistente rebotaría indefinidamente y taparía a los correos que
sí pueden salir.

### El enlace: de un solo uso y sin guardar

El token viaja en el correo; en la base solo queda su **SHA-256**. Un enlace de recuperación da
acceso a la cuenta: si se guardara en claro, leer la tabla permitiría entrar en las cuentas con
enlaces pendientes.

`POST /cuentas/verificar` y no `GET` a propósito — los previsualizadores de enlaces de algunos
clientes de correo abren las URL antes de que nadie las pulse, y quemarían el enlace antes de llegar
a su destinatario.

Los cuatro motivos por los que un enlace falla (no existe, ya se usó, caducó, es de otro tipo) dan
**el mismo error**: distinguirlos le diría a quien prueba enlaces al azar si ha acertado con uno
real.

### El login: tres casos que no se distinguen

Correo inexistente, contraseña incorrecta y **cuenta bloqueada** responden el mismo `401
CREDENCIALES_INVALIDAS` y tardan lo mismo:

- Sin cuenta, la contraseña se comprueba igualmente contra un **hash señuelo** calculado al
  arrancar. Sin él, un correo inexistente responde en ~4 ms y uno real en ~50 ms (medido).
- Con la cuenta bloqueada **no se comprueba la contraseña real**, solo el señuelo. Si se
  comprobara, el atacante podría seguir probando durante el bloqueo y sabría cuándo acierta. El
  aviso concreto le llega al dueño por correo. Ver DECISIONES.md §12.

Solo quien acierta la contraseña recibe `403 CUENTA_NO_VERIFICADA` o `403 CUENTA_DESACTIVADA`: ya
sabe que la cuenta existe, así que decírselo no filtra nada.

### CU-027D: el bloqueo aguanta ráfagas

Cada fallo se anota con un único `UPDATE … WHERE <no bloqueada>` que suma y, al quinto, bloquea.
PostgreSQL serializa las escrituras sobre la misma fila y reevalúa la condición, así que 30
intentos simultáneos evalúan 5 y el resto encuentra la cuenta ya bloqueada. Sin esa condición la
ráfaga **no llega a bloquear** la cuenta (comprobado quitándola).

Al principio esto se conseguía con `SELECT … FOR UPDATE`, pero obligaba a calcular scrypt con la
fila bloqueada y una conexión retenida, y eso tumbaba el servicio en los picos. Ver *Disponibilidad*
más abajo y DECISIONES.md §17.

### El token

JWT RS256 (desde el paso 7; ver más abajo) con `sub`, `roles` y `jti` — **nada personal**, porque un JWT se firma pero no se cifra.
El algoritmo se fija también al verificar (un token `alg: none` se rechaza). En la tabla `sesiones`
se guarda el `jti`, no el token, y es lo que permite que **cerrar sesión funcione de verdad**: el
token revocado se rechaza aunque no haya caducado.

### CU-027A: recuperación de contraseña

- **La solicitud responde antes de hacer nada** y siempre lo mismo. Buscar la cuenta y crear el
  enlace solo ocurre si la cuenta existe; hacerlo antes de responder la delataba por el tiempo
  (4,7 ms frente a 1,7, medido). Respondiendo primero: 1,2 / 0,8 / 0,7 ms.
- **Un enlace por minuto como máximo** por cuenta, para que nadie pueda llenar el buzón de otra
  persona; y pedir uno nuevo **invalida el anterior**.
- Usar el enlace: se quema (con `FOR UPDATE` **y** un `UPDATE` condicional), cambia la contraseña,
  **cierra todas las sesiones**, **levanta el bloqueo** de CU-027D, **activa la cuenta** si seguía sin
  verificar y avisa por correo de que la contraseña cambió.
- Una contraseña débil se rechaza **sin gastar el enlace**. Una cuenta desactivada (CU-027B) no se
  recupera, ni siquiera con un enlace enviado antes de desactivarla.

### CU-027C: perfil

- Las rutas no llevan identificador: la cuenta es siempre la del token.
- **Solo el nombre es editable.** Se valida con la misma regla que el registro (2–160 caracteres,
  sin caracteres de control ni de formato, que permitirían falsear líneas en correos y logs). El
  correo no se cambia desde aquí (DECISIONES.md §14).
- **Cambiar la contraseña pide la actual**, y sus fallos **suman al mismo contador que el login**:
  sin eso, un token robado permitiría probar contraseñas sin límite. Al bloquearse se cierran todas
  las sesiones, incluida la del atacante. Si sale bien, se cierran las demás sesiones y se conserva
  la actual.

### Paso 7: los tokens valen en el resto del sistema

- **RS256.** La clave privada solo la tiene este servicio; la reventa recibe la pública, que no
  sirve para firmar (DECISIONES.md §7).
- **Cerrar sesión llega a todos.** Cada sesión cerrada —logout, cambio o restablecimiento de
  contraseña, bloqueo desde la sesión— se publica en Redis como `sesion-revocada:<jti>` con la vida
  que le queda al token, **dentro de la misma transacción**: si Redis falla, la operación falla en
  vez de decir "sesión cerrada" sin que lo esté (DECISIONES.md §16). Al arrancar se republican las
  vigentes, y la semilla anuncia las sesiones que borra.
- Contrato completo: [`App/shared/seguridad/token-sesion.md`](../../shared/seguridad/token-sesion.md).
  La prueba entre servicios está en el CU-006: `pruebas/rnf06-autenticacion.py`.

**Un error encontrado por esa prueba:** `returning(['jti', 'expira_en'])` de TypeORM espera nombres
de propiedad y **descartaba en silencio** `expira_en`. La fecha quedaba inválida, el filtro de
"vigentes" la tiraba, y ninguna revocación llegaba a Redis — mientras las pruebas de este servicio,
que validan contra la base, seguían pasando. Ahora se usa SQL explícito y una fecha inválida hace
fallar la operación en vez de ignorarse.

### Renovación de sesiones

El token de acceso dura **15 minutos**; el de renovación, **30 días desde el último uso, sin tope**.
Mientras se use la app, la sesión no se cierra: la app renueva sola, una renovación a la vez.

- Cada renovación lee **roles y estado de la cuenta en la base** y conserva el `jti`, así que la
  reventa y la lista de Redis no cambian.
- **Rotación:** usar un token de renovación ya gastado cierra la sesión entera, y la persona
  legítima recibe un aviso de seguridad. Sin guardar cada token: el token lleva id de sesión,
  generación y un HMAC (DECISIONES.md §21).
- Un token inventado no puede cerrar la sesión de nadie.
- **En la web** (`X-Hexacore-Cliente: web`), el token de renovación va en una cookie `HttpOnly`,
  `SameSite=Strict`, limitada a `/api/v1/sesiones`, y no en el cuerpo (DECISIONES.md §22). Los
  portales permitidos se configuran en `CORS_ORIGENES`.

### Administración de cuentas (CU-027B)

- **Solo administradores, preguntando a la base en cada petición.** El token congela los roles
  durante una hora; a quien le quitan el rol de administrador se le cierran estas rutas en la
  siguiente petición, no al caducar el token.
- **Desactivar cierra la puerta de verdad:** además de impedir el login, cierra en la misma
  transacción todas las sesiones de la cuenta, también en Redis, así que la reventa las rechaza al
  instante. Si Redis no responde, no se desactiva nada.
- **Eliminar anonimiza** (DECISIONES.md §19): borra nombre, correo, contraseña, roles, enlaces y la
  IP y el navegador de sus sesiones, pero conserva la fila, cuyo id usan otros servicios. El correo
  queda libre para registrarse de nuevo.
- **Nunca sin administradores.** Nadie se desactiva ni se elimina a sí mismo, y los cambios se
  serializan con un bloqueo de PostgreSQL: dos administradores que se desactivan el uno al otro a la
  vez dejan siempre a uno activo. Sin ese bloqueo, PostgreSQL resolvía la carrera abortando una
  transacción por interbloqueo, y el perdedor recibía un 500 (comprobado quitándolo).
- **Auditoría de solo inserción** (`auditoria_cuentas`): quién, qué, por qué, cuándo y cuántas
  sesiones se cerraron. Un *trigger* impide editarla o borrarla, y la cuenta auditada no puede
  borrarse a mano.

### Disponibilidad

El CU-027 pide que *"el login responda incluso en horas pico (apertura de venta)"*; RNF-03 y RNF-04,
que el sistema siga atendiendo y se recupere solo. La revisión encontró cinco problemas; todos
están corregidos y medidos con `pruebas/cu027-disponibilidad.py`.

| Problema | Antes | Después |
|---|---|---|
| Node usa 4 hilos para scrypt, tenga los núcleos que tenga | 76 login/s | **114 login/s** (uno por núcleo) |
| scrypt, y después la firma RS256, retenían conexiones del pool | una consulta de 2 ms esperó **4,9 s** | 0 conexiones retenidas; máx. < 1 s |
| Sin límite de espera hacia PostgreSQL | login colgado **> 40 s** | **503** en 3 s |
| `/salud` no miraba la base | 200 con la base caída | **503** sin PostgreSQL |
| Nada reiniciaba el servicio | — | vuelve en **1,3 s** tras `kill -9` (RNF-04: ≤ 30 s) |

Las cifras son de un portátil de 11 núcleos, con el servicio en Docker y el generador de carga en la
misma máquina.

- **Redis o RabbitMQ caídos:** el login y el registro siguen funcionando, y `/salud` sigue en 200.
  Sacar la instancia de rotación por eso dejaría a todo el mundo sin entrar por un fallo que no
  impide entrar. Sin Redis falla cerrar sesión (decidido en §16); sin RabbitMQ se retrasan los
  correos.
- **Con 300 personas entrando a la vez** cada una espera ~2,6 s: es 300 ÷ 114. Eso ya no se baja
  optimizando una instancia, sino añadiendo réplicas. Con dos instancias se comprobó que el token,
  el cierre de sesión y el bloqueo por intentos son los mismos en ambas.
- **Límites:** no hay API Gateway, así que RNF-03 (seguir atendiendo si cae una instancia) solo se
  probó apagando una de dos instancias a mano. Docker Compose reinicia un proceso que muere, pero no
  uno que sigue vivo y colgado; eso lo hace la sonda de vida de Kubernetes en producción. Ver
  DECISIONES.md §18.

### Evidencia

```bash
python3 pruebas/cu027-registro.py      # pasos 1-4
python3 pruebas/cu027-verificacion.py  # pasos 5-7 y CU-027E
python3 pruebas/cu027-login.py         # pasos 8-9 y CU-027D
python3 pruebas/cu027-recuperacion-perfil.py  # CU-027A y CU-027C
python3 pruebas/cu027b-administracion.py      # activar, desactivar, eliminar, carreras
python3 pruebas/cu027-renovacion.py           # renovación, rotación y robo de tokens
python3 pruebas/cu027-disponibilidad.py       # carga, dependencias caídas y RNF-04
```

```
Pasos 8-9        token emitido sin datos personales · sesión y último acceso registrados
Cerrar sesión    el mismo token recibe 401 después
Falsificados     alg none, otra clave y basura: 401
Sin revelar      correo inexistente 47 ms · contraseña mal 51 ms · misma respuesta
Estados          sin verificar / desactivada: solo se dice con la contraseña correcta
CU-027D          al 5º fallo se bloquea · aviso por correo · la contraseña buena no entra
Tras el bloqueo  se entra y el contador vuelve a cero
Ráfaga de 30     se evaluaron 5, cuenta bloqueada, un solo aviso
```

```
CU-027A          misma respuesta y mismo tiempo exista o no · un enlace aunque se pida 6 veces
Enlace           30 min · solo el hash en la base · débil no lo gasta · no sirve dos veces
Tras restablecer vieja no entra · sesiones cerradas · aviso por correo
Inválidos        el anterior al pedir otro · caducado · uno de verificación
Simultáneo       10 usos del mismo enlace: 1 aceptado
Rescates         cuenta bloqueada vuelve a entrar · sin verificar queda ACTIVA · desactivada no
CU-027C          8 ediciones inválidas rechazadas sin tocar la base · registro valida igual
Contraseña       débil/igual no cuenta como fallo · esta sesión sigue, las otras se cierran
Token robado     4 × 422 y luego 429 · todas las sesiones cerradas · aviso de bloqueo
```

En el paso 6 se comprobaron quitándolas: responder después del trabajo (detectado: 4,7 ms frente
a 1,7), no compartir el contador de fallos (detectado: cinco 422 sin bloqueo) y no cerrar las demás
sesiones (detectado). **Lo que la prueba no puede demostrar** es el `FOR UPDATE` sobre el enlace:
scrypt escalona los diez usos simultáneos antes de la transacción y la carrera no llega a
producirse. Por eso el enlace se quema además con un `UPDATE` condicional, que no depende del
bloqueo.

Las tres protecciones del paso 5 se comprobaron **quitándolas**: sin señuelo (4 ms frente a 51), sin
`FOR UPDATE` (la ráfaga no bloquea) y comprobando la contraseña durante el bloqueo (entra con 200):
la prueba falla en los tres casos.

```
Pasos 5-7        correo recibido · enlace usado · cuenta ACTIVA
Un solo uso      el segundo intento con el mismo enlace se rechaza
Sin guardar      en la base solo hay un SHA-256 de 64 caracteres
Enlace inválido  mismo mensaje que uno ya usado
Aviso al dueño   "alguien intentó registrarse con tu correo", sin enlace
CU-027E(a)       tras dos 503, el correo acabó entregándose
CU-027E(b)       dirección inexistente: a la DLQ sin reintentar
```

```
1. Registro correcto -> cuenta PENDIENTE_VERIFICACION, rol Cliente, hash scrypt
2. Correo repetido   -> misma respuesta, 1 sola cuenta, nombre original intacto
3. Seis validaciones con mensajes claros
4. El tiempo de respuesta no distingue un correo existente de uno nuevo
```

## Configuración

Todas las variables están en [`.env.example`](.env.example). La configuración se **valida al
arrancar**: en un servicio de autenticación, una política laxa no se manifiesta como un fallo sino
como un sistema que *parece* funcionar mientras acepta lo que no debería.

El servicio se niega a levantar si:

```
producción sin claves JWT propias       quien tenga la privada fabrica tokens de cualquiera
producción con las claves del repo      están publicadas: cualquiera podría firmar
clave pública que no casa con la privada los demás servicios rechazarían todos los tokens
clave RSA < 2048 bits                   por debajo ya no se considera segura
contraseña mínima < 8                  la validación de fortaleza sería decorativa
bloquear con < 3 intentos              castigaría a quien se equivoca al teclear
bloqueo de 0 minutos                   no frena una fuerza bruta
recuperación > 24 h                    el enlace da acceso a la cuenta
token de acceso fuera de 1–60 min       para sesiones largas está la renovación
renovación fuera de 1–365 días
espera a la base fuera de 0,5–30 s      o corta consultas normales, o deja el login colgado
pool de menos de 2 conexiones           un solo login bloquearía el resto
```

En desarrollo se usan las claves de [`App/infra/claves-desarrollo/`](../../infra/claves-desarrollo/) y el servicio
**avisa en el log** de que lo está usando.

## Decisiones abiertas

El CU-027 exige hash, tokens con expiración y bloqueo por fuerza bruta, pero **no fija ni un solo
valor** ni nombra un algoritmo. Todos los puntos —incluido por qué se usa `scrypt` y no Argon2id, y
por qué el login no dice nunca si un correo existe— están en [`DECISIONES.md`](DECISIONES.md).

## Pruebas

```bash
npm test          # unitarias
npm run test:cov  # cobertura — RNF-18 pide ≥ 70 % de la lógica de dominio
npm run lint      # comprobación de tipos
```
