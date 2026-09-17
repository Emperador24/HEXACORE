# Decisiones abiertas del CU-027

El **CU-027 (Gestión de Cuentas de Usuario)** exige *"contraseñas cifradas (hash + salt), tokens de
sesión con expiración, bloqueo ante fuerza bruta"*, y su post-condición 2 habla de un token que
*"expira según la política de seguridad"* — pero **no fija ni un solo valor**, ni nombra un algoritmo.

Igual que en el CU-006, se resuelven aquí con un valor por defecto razonado y **configurable**. Este
archivo es la propuesta; si el equipo ratifica alguno, sube a ADR en el SAD §14.

---

## 1. Algoritmo de hash — **no especificado**

La ficha pide *"hash + salt"* y *"almacenamiento seguro de credenciales (hash)"*, sin decir con qué.

**Propuesta:** `scrypt`, de la librería estándar de Node (`node:crypto`), con salt aleatorio de 16
bytes por contraseña.

**Por qué no Argon2id**, que es el recomendado por OWASP hoy: `argon2` es un paquete **nativo** que
compila con node-gyp al instalarse. Este proyecto lo instalan cuatro personas en cuatro máquinas
distintas, y una compilación nativa fallida bloquea a quien la sufra. `scrypt` es igualmente
*memory-hard* —resistente a GPU y ASIC, que es lo que importa frente a bcrypt—, viene auditado con
Node, y no puede fallar al instalar.

**Cuándo revisar esta decisión:** si el sistema fuera a producción real, Argon2id es preferible y el
cambio queda acotado a un solo archivo, porque el hash se encapsula tras una interfaz.

**Lo que NO se guarda:** la contraseña en claro, en ningún punto ni momento. Ni en la base, ni en
logs, ni en el token.

---

## 2. Longitud mínima de contraseña — **no especificada**

El paso 2 del flujo dice *"valida el formato del correo y la fortaleza de la contraseña"* sin
definir qué es fortaleza.

**Propuesta:** `AUTH_LONGITUD_MINIMA_CONTRASENA = 10`, sin exigir mayúsculas, números ni símbolos.

**Por qué solo longitud:** las reglas de composición empujan a las personas hacia contraseñas
predecibles del tipo `Password1!`, que cumplen todos los requisitos y son de las primeras que prueba
un atacante. El NIST desaconseja explícitamente exigir composición y recomienda apoyarse en la
longitud. Diez caracteres sin restricciones permite además frases de paso, que son más fáciles de
recordar y más difíciles de romper.

**Guarda:** el servicio se niega a arrancar por debajo de 8. Con menos, la comprobación de fortaleza
del paso 2 sería decorativa.

---

## 3. Vida del token de sesión — **"según la política de seguridad"**

La post-condición 2 dice literalmente eso, sin fijar el plazo.

*Revisada:* al principio el token duraba 60 minutos y no se podía renovar, así que la app devolvía
al login a quien la estuviera usando. Ahora hay **dos tokens**: uno de acceso de **15 minutos** y
uno de renovación que dura **30 días desde el último uso, sin tope absoluto**. Ver §21.

---

## 4. Bloqueo por fuerza bruta (CU-027D) — **sin umbrales**

El flujo alterno dice *"si se detectan múltiples intentos fallidos de inicio de sesión, el sistema
bloquea temporalmente la cuenta"*. Ni cuántos, ni cuánto.

**Propuesta:** `AUTH_INTENTOS_ANTES_DE_BLOQUEAR = 5`, `AUTH_BLOQUEO_MINUTOS = 15`.

**Por qué esos valores:** cinco intentos toleran a quien se equivoca al teclear o prueba dos
contraseñas viejas; quince minutos hacen inviable la fuerza bruta (a 5 intentos por cuarto de hora,
probar mil contraseñas lleva más de dos días) sin castigar de forma desproporcionada a quien
simplemente olvidó la suya.

**Guardas:** menos de 3 intentos se rechaza al arrancar (bloquearía a gente legítima); un bloqueo de
0 minutos también (no frena nada).

**Consecuencia asumida:** el bloqueo por cuenta permite que alguien moleste a otra persona
bloqueándole el acceso a propósito. La alternativa —bloquear por IP— falla con NAT y es fácil de
sortear. Mitigarlo bien requiere limitación de tasa en el API Gateway, que es donde corresponde.

---

## 5. Vida de los enlaces de verificación y recuperación — **no especificada**

**Propuesta:** verificación de cuenta **24 horas**; recuperación de contraseña **30 minutos**.

**Por qué son tan distintos:** verificar una cuenta es una acción sin riesgo y la persona puede
tardar en abrir el correo. Un enlace de recuperación, en cambio, **da acceso a la cuenta**: cuanto
más vive, más tiempo sirve si alguien llega al buzón de la víctima. Treinta minutos bastan para
usarlo de inmediato y poco más.

**Guarda:** el servicio rechaza un plazo de recuperación superior a 24 h.

**Además:** el enlace de recuperación es de **un solo uso**, como pide el propio CU-027A.

---

## 6. No revelar si un correo existe — **sí está en la ficha**

Esta no es una decisión abierta, sino un requisito explícito del atributo de Usabilidad del CU-027:
*"mensajes de error claros, sin revelar si el correo existe (evita filtrar información)"*.

Tiene una consecuencia que conviene anotar porque parece un error de diseño y no lo es:

- **Login con correo inexistente** y **login con contraseña incorrecta** devuelven exactamente la
  misma respuesta. Si se distinguieran, cualquiera podría averiguar qué correos están registrados
  probándolos uno a uno.
- **Recuperación de contraseña** responde siempre lo mismo —*"si el correo existe, te enviamos un
  enlace"*— exista o no la cuenta.

---

## 8. Qué responde el registro cuando el correo ya existe

El atributo de Usabilidad del CU-027 exige *"mensajes de error claros, sin revelar si el correo
existe (evita filtrar información)"*. Eso choca de frente con el error más natural de un formulario
de registro.

**Propuesta:** el registro responde **exactamente lo mismo** exista o no el correo —
`202 Accepted` con *"Si el correo no estaba registrado, te enviamos un enlace para verificar tu
cuenta"*—, y por dentro se distingue.

**Por qué:** si dijera *"ese correo ya está registrado"*, el formulario serviría para averiguar
quién tiene cuenta en el sistema probando correos uno a uno. Es un ataque trivial y no necesita
credenciales.

**Lo que cambia por dentro:** a quien ya tiene cuenta no se le crea nada, y el correo que recibirá
(paso 4 de la implementación) le avisará de que alguien intentó registrarse con su dirección, en
lugar de un enlace de verificación. Esa asimetría es invisible desde fuera y útil para la persona
legítima.

**Tres consecuencias que hay que asumir:**

1. **No se devuelve el identificador de la cuenta.** Hacerlo distinguiría "creada" de "ya existía".
2. **Se cifra la contraseña incluso cuando el correo ya existe**, aunque parezca trabajo tirado.
   `scrypt` tarda ~100 ms a propósito: si solo se cifrara cuando el correo está libre, un correo
   registrado respondería mucho más rápido y **el tiempo revelaría lo que la respuesta calla**.
   Medido: 51,3 ms frente a 52,1 ms, menos de 1 ms de diferencia.
3. **La fortaleza de la contraseña se valida antes de tocar el correo.** Si se comprobara después,
   el orden de los errores filtraría lo mismo: con una contraseña deliberadamente débil, recibir
   `CONTRASENA_DEBIL` significaría "el correo estaba libre".

**El coste:** alguien que se registró hace meses y no lo recuerda recibe un mensaje ambiguo en vez de
"ya tienes cuenta". Lo resuelve la recuperación de contraseña (CU-027A), que existe justo para eso.

---

## 9. Toda la política de la contraseña, en una sola función

Al principio la longitud mínima estaba en el servicio y la máxima en un decorador del DTO. Omitir el
campo producía entonces *"la contraseña es demasiado larga"* — lo contrario de lo que pasaba, y una
contradicción directa del *"mensajes de error claros"* del CU-027.

**Regla:** `problemaDeContrasena` es el único sitio que decide si una contraseña vale. El DTO solo
comprueba que venga. Los decoradores de `class-validator` se evalúan de abajo arriba y acumulan
errores, así que repartir una política entre varios produce mensajes que se pisan.

El servicio usa además `stopAtFirstError`, para que cada campo informe de un solo problema en vez de
la lista completa de validadores que falló.

---

## 10. Qué pasa si el correo no se puede encolar

`PublicadorCorreos.encolar` **nunca lanza**: si RabbitMQ está caído, lo registra como error y
devuelve `false`.

**Por qué:** cuando se le llama, la cuenta ya está creada en la base. Hacer fallar el registro porque
un correo no se pudo encolar sería decirle a alguien que su alta no funcionó cuando sí lo hizo.

**Lo que se pierde:** el correo de verificación, no la cuenta. Quien se registró se queda con una
cuenta `PENDIENTE_VERIFICACION` y sin enlace para activarla.

**Lo que falta para cerrarlo:** el mismo patrón *outbox* que ya está anotado en el CU-006 —escribir
el encargo del correo en la misma transacción que la cuenta y que un proceso aparte lo publique—, o
un endpoint de "reenviar verificación" que permita pedir otro enlace. Lo segundo es más barato y
además resuelve el caso normal de "no me llegó el correo"; queda como trabajo pendiente.

**Nota sobre el arranque:** el servicio levanta aunque RabbitMQ no esté. Aquí pesa más que en el
CU-006: el CU-027 marca la Disponibilidad del login como atributo de calidad, y negarse a arrancar
por un broker caído dejaría a **todo el sistema sin poder iniciar sesión** por un fallo en algo que
solo manda correos.

---

## 11. El correo de verificación usa SHA-256 y las contraseñas no

Parece una contradicción —SHA-256 es justo lo que se descartó para las contraseñas— pero la
diferencia está en la entropía de lo que se protege.

Una **contraseña** la elige una persona, y por buena que sea entra en el espacio de lo adivinable: hay
que encarecer cada intento, y para eso está `scrypt` con sus ~100 ms.

Un **token de enlace** son 32 bytes aleatorios: 256 bits que no se adivinan por fuerza bruta ni con
todos los intentos del mundo. Un hash rápido basta, y evita gastar 100 ms en cada comprobación de
enlace.

---

## 12. El bloqueo de CU-027D no se anuncia en la respuesta

La ficha dice que la cuenta *"se bloquea temporalmente"*, pero no cómo se entera la persona. La
opción evidente —un `429 CUENTA_BLOQUEADA`— tiene dos fugas, según cuándo se devuelva:

- **Solo a quien acierta la contraseña:** el atacante sigue probando durante el bloqueo, y el día
  que reciba "bloqueada" en vez de "incorrecta" sabrá que acertó. El bloqueo no frenaría nada.
- **A todo el que lo intente:** fallar cinco veces con un correo y mirar si aparece "bloqueada"
  diría si ese correo tiene cuenta, que es lo que prohíbe el §6.

**Decisión:** mientras dura el bloqueo **no se comprueba la contraseña** y la respuesta es la misma
`401 CREDENCIALES_INVALIDAS` de siempre, cuyo mensaje avisa en general de que *"tras varios intentos
fallidos, el acceso se suspende unos minutos"*. A quien de verdad tiene la cuenta se le avisa **por
correo** en el momento del bloqueo, sin enlace (lo provoca un desconocido).

**Coste asumido:** quien olvidó la contraseña y se bloquea a sí mismo no ve un mensaje específico en
pantalla; lo tiene en el correo.

**Detalles:** los intentos durante el bloqueo no suman ni lo alargan; al bloquear el contador vuelve
a cero, para que al levantarse haya otros cinco intentos y no uno.

---

## 13. Restablecer la contraseña también levanta el bloqueo y activa la cuenta

La ficha solo dice que el enlace es *"de un solo uso con expiración"*. Usarlo, sin embargo,
**demuestra que se controla el correo**, que es la prueba más fuerte que tiene el sistema. De ahí
tres efectos además de cambiar la contraseña:

- **Levanta el bloqueo de CU-027D.** Esperar 15 minutos demuestra menos que abrir el enlace.
- **Activa una cuenta sin verificar.** Resuelve el atasco del §8: quien se registró y dejó caducar
  el enlace de verificación no puede volver a registrarse (el registro responde lo mismo), pero sí
  puede "recuperar la contraseña", y eso lo deja dentro.
- **Cierra todas las sesiones.** Quien restablece la contraseña a menudo sospecha que se la robaron.

Lo que **no** hace: recuperar una cuenta **desactivada** (CU-027B). Restablecer la contraseña no
puede ser una puerta trasera para saltarse una decisión del administrador. A esas cuentas no se les
envía enlace, y uno enviado antes de desactivarlas deja de servir.

**Límites de envío:** un enlace por minuto por cuenta (si no, cualquiera podría llenar el buzón de
otra persona), y pedir uno nuevo invalida los anteriores.

---

## 14. El correo no se puede cambiar desde el perfil

CU-027C dice *"el sistema valida los nuevos datos antes de guardarlos"*, sin decir qué datos. El
nombre sí es editable. **El correo no**, y no por olvido: cambiarlo bien exige más que validar su
formato.

- El correo es **la identidad de la cuenta**: con él se entra y a él llegan los enlaces de
  recuperación. Quien cambie el correo de una cuenta ajena se queda con ella.
- Hacerlo con garantías exige **pedir la contraseña, verificar la dirección nueva con un enlace y
  avisar a la antigua** — un flujo con su propio tipo de enlace y una columna para la dirección
  pendiente, es decir, una migración.

Ninguna de las fichas lo pide, así que queda fuera. Si se intenta, se responde
`422 CORREO_NO_EDITABLE` con un mensaje claro, en lugar del genérico en inglés de la validación.

**Pendiente si el equipo lo necesita:** el flujo de cambio de correo descrito arriba.

---

## 15. Cambiar la contraseña comparte el contador de fallos del login

Cambiar la contraseña pide la actual, aunque ya haya sesión. Si los fallos de esa comprobación no
contaran, un token robado permitiría probar contraseñas **sin límite**: el bloqueo del login no
serviría de nada, porque el atacante nunca pasaría por el login.

Por eso usan el mismo contador y el mismo umbral. Al bloquearse **se cierran todas las sesiones de la
cuenta**, la del atacante incluida, y aquí sí se responde `429 CUENTA_BLOQUEADA` explícito: quien
llama ya está dentro de esa cuenta, así que decirlo no filtra nada (compárese con el §12).

Responder `422` y no `401` a una contraseña actual incorrecta también es deliberado: un `401` haría
creer al cliente que la sesión caducó y lo mandaría al login.

---

## 17. El login no retiene conexiones mientras calcula

*Resultado de la revisión del atributo de Disponibilidad.* La ficha dice *"el login es crítico y
debe responder incluso en horas pico (apertura de venta)"*. Medido con 300 cuentas:

**1. El techo lo ponía Node, no la CPU.** scrypt corre en el pool de hilos de libuv, que tiene 4
hilos por defecto aunque la máquina tenga 11 núcleos: 76 login/s. Ahora `src/hilos.ts` usa uno por
núcleo (se puede fijar con `UV_THREADPOOL_SIZE`). Más hilos que núcleos no ayudan: scrypt es CPU pura.

**2. scrypt dentro de una transacción ahogaba el resto del servicio.** El login leía la cuenta con
`FOR UPDATE`, calculaba scrypt (~50-100 ms) y escribía, todo con la fila bloqueada y una de las 10
conexiones del pool ocupada. En un pico, cualquier otra consulta esperaba turno: una de 2 ms tardó
4,9 s.

**Decisión:** leer sin bloquear → scrypt sin tocar la base → firmar el token → **una sola
sentencia** condicional que anota el resultado. El fallo es un `UPDATE … WHERE <no bloqueada>` que
suma y bloquea a la vez; el acierto, un `UPDATE` con CTE que además inserta la sesión.

Se conserva lo que el bloqueo de fila garantizaba: PostgreSQL serializa los `UPDATE` sobre la misma
fila y reevalúa la condición, así que de 30 intentos simultáneos solo cuentan 5, y un acierto que
termina después del bloqueo no abre sesión. El acierto exige además que `hash_contrasena` siga
siendo el que se verificó: un login con la contraseña vieja que empiece justo antes de un cambio no
abre sesión después.

**Un segundo hallazgo al medirlo:** con scrypt fuera, quedaban hasta 8 conexiones en *idle in
transaction*. La firma RS256, que es CPU en el hilo principal, estaba dentro de la transacción, y
entre sus dos sentencias la conexión esperaba a que Node volviera. Por eso ahora se firma antes y
las dos escrituras van en una sola sentencia. Tras el cambio: 0 conexiones retenidas.

**Coste asumido:** el token se firma antes de saber si el acierto se anotará. Si no se anota, el
token se descarta sin salir del proceso. Ese camino (una carrera entre un acierto y un bloqueo, o
un cambio de contraseña) no tiene prueba automática: no se puede provocar de forma determinista.

**3. Una base colgada dejaba el login sin responder.** Sin límites de espera, más de 40 s.
Ahora: `connectionTimeoutMillis` y `query_timeout` en el cliente, y `statement_timeout` en el
servidor (`POSTGRES_ESPERA_MAXIMA_MS`, 3 s). Los dos del cliente son los que importan con una base
colgada, porque un servidor que no responde no aplica su propio límite. Un filtro global convierte
esos fallos en **503 `SERVICIO_NO_DISPONIBLE`** con `Retry-After`, en vez de un 500 que parece un
error del programa.

**Lo que no se arregla optimizando una instancia:** con 300 personas a la vez, cada una espera
~300 ÷ capacidad segundos (2,6 s con 114 login/s). Bajar eso es cosa de réplicas (ADR-01, ADR-02),
y el servicio ya está preparado para tenerlas: no guarda estado en memoria.

**Pendiente:** si el pico real supera lo que se puede escalar, bajar el coste de scrypt (`N = 2^14`)
duplica la capacidad a cambio de la mitad de resistencia ante fuerza bruta offline. No se ha hecho:
es una decisión de seguridad que corresponde al equipo.

---

## 18. Los servicios corren en contenedor con reinicio automático

RNF-04 pide *"ante la caída de una instancia, el sistema se recupera sin intervención manual"* en
≤ 30 s. Con `npm run start:dev`, un proceso que muere se queda muerto.

**Decisión:** Dockerfile para Administración y para Entradas, y los dos en `docker-compose.yml`
con `restart: unless-stopped`, bajo el perfil `servicios`. El `up -d` de siempre no los levanta,
para no chocar con quien desarrolla con `npm`.

- **Medido:** `kill -9` al proceso → atendiendo logins de nuevo en 1,0–1,3 s.
- **Con PostgreSQL caído:** el contenedor sale (fallan las migraciones o la conexión), Docker lo
  reintenta (6 veces en 25 s) y queda sano 0,5 s después de que vuelva la base.
- **`init: true`**: sin él, node es el PID 1 del contenedor y el kernel le trata las señales de forma
  especial. Además, así se pudo simular una caída real desde dentro. `docker kill` no sirve para
  probarlo, porque Docker lo cuenta como parada manual y no reinicia.
- **`/salud` decide la salud del contenedor** y responde 503 si falta PostgreSQL. Redis y RabbitMQ
  se informan pero no la cambian (medido: sin ellos el login funciona).
- **`dotenv` pasó a dependencia de producción.** Lo importa `data-source.ts` en tiempo de ejecución;
  funcionaba solo porque lo arrastraba `@nestjs/config`.

**Límites de este ambiente:**

- Docker Compose **no reinicia un contenedor vivo pero `unhealthy`** (colgado). Eso lo hace la sonda
  de vida de Kubernetes, que es lo que el SAD §11 prevé para producción.
- Tras muchos reinicios seguidos, Docker espacia los intentos (hasta un minuto). Una caída larga
  de la base podría hacer que el servicio tarde más de 30 s en volver *después* de que vuelva la
  base. RNF-04 habla de la caída de una instancia, no de la base, pero conviene saberlo.
- Las migraciones corren al arrancar. Con varias réplicas deberían ir en un paso aparte del
  despliegue, para que no las corran todas a la vez.

---

## 19. Eliminar una cuenta es anonimizarla

El objetivo del CU-027 dice que el administrador puede *"eliminar cuentas"*, sin más. Un `DELETE`
de la fila parece lo obvio, y no lo es:

- **Otros servicios guardan el id.** Una entrada tiene `propietario_id`, una publicación
  `vendedor_id`, una transacción `comprador_id`, y el historial de propietarios del CU-006 los
  encadena. ADR-01 prohíbe llaves foráneas entre bases, así que nadie impediría el borrado, y
  esos ids quedarían apuntando a nadie.
- **Hay registros que deben conservarse:** transacciones de dinero (RNF-11 exige retener el
  historial al menos un año) y la propia auditoría de quién eliminó la cuenta.

**Decisión:** eliminar **anonimiza**. Se borra todo lo que identifica a la persona (nombre, correo,
contraseña, roles, enlaces pendientes, IP y navegador de sus sesiones), la cuenta queda desactivada
para siempre y `eliminada_en` la distingue de una simple desactivación. El correo pasa a
`eliminada-<id>@cuentas.invalid` (`.invalid` es un dominio reservado), así que queda libre para un
registro nuevo, que será **otra** cuenta con otro id.

**Restricciones en la base:** una cuenta eliminada no puede estar activa, y una cuenta con
auditoría no se puede borrar.

**Lo que no hace:** no toca las bases de otros servicios. Si la persona tenía entradas, siguen a
nombre de ese id, que ahora se muestra como "Cuenta eliminada". Qué hacer con esas entradas (anularlas,
reembolsarlas) es del dominio de Entradas, no de este.

---

## 20. Desactivar y eliminar: motivo obligatorio, nunca a uno mismo, nunca el último

- **Motivo obligatorio** (5 a 300 caracteres) para desactivar y eliminar; opcional para activar.
  Una desactivación sin explicación no se puede justificar después.
- **Nadie se desactiva ni se elimina a sí mismo.** Si fuera el único administrador, nadie podría
  deshacerlo; si no lo es, que lo haga otro deja constancia de dos personas.
- **Nunca sin administradores activos.** Con solo la regla anterior, dos administradores podían
  desactivarse el uno al otro a la vez: cada uno veía "queda el otro". Los cambios se serializan con
  `pg_advisory_xact_lock`. **Coste:** todas las desactivaciones y eliminaciones van de una en una;
  son acciones de administración, raras, y la espera es de milisegundos.
- **Activar una cuenta pendiente** es el administrador respondiendo por ella: recibe fecha de
  verificación y sus enlaces de verificación pendientes se anulan.
- **El rol se comprueba en la base, no en el token** (§7 y §16 explican por qué el token dura una
  hora).

---

## 21. Renovación de sesiones: acceso de 15 minutos, renovación de 30 días sin uso

**El problema:** con un único token de 60 minutos, la app devolvía al login a quien la estuviera
usando. Alargar ese token no era la salida: un token robado valdría semanas, los roles quedarían
congelados en el resto de servicios (que se fían del token sin preguntar) y la lista de sesiones
cerradas en Redis tendría que guardarse igual de tiempo.

**Decisión:** dos tokens.

| | Acceso | Renovación |
|---|---|---|
| Qué es | El JWT RS256 de siempre | 70 caracteres opacos |
| Duración | `AUTH_SESION_MINUTOS` = 15 (máx. 60) | `AUTH_RENOVACION_DIAS` = 30 desde el último uso |
| Se envía a | Todos los servicios | Solo a `POST /sesiones/renovar` |

Cada renovación **lee los roles y el estado de la cuenta en la base**, emite un token de acceso
nuevo **con el mismo `jti`** (identifica la sesión, así que Redis y la reventa no cambian) y **rota**
el token de renovación.

**Sin tope absoluto** (decisión del equipo): quien use la app al menos una vez cada 30 días no vuelve
a escribir la contraseña. Pedirla cada cierto tiempo a alguien en la puerta de un evento era peor que
el riesgo que cubre, y ese riesgo ya lo cubre la rotación.

### Rotación y detección de robo, sin guardar cada token

Usar un token de renovación **ya gastado** significa que dos partes tienen copia. Se cierra la sesión
entera, y quien tenga la contraseña vuelve a entrar; el atacante no.

Detectarlo suele exigir guardar el hash de cada token emitido. Con un acceso de 15 minutos y
sesiones sin tope serían miles de filas por sesión activa. En su lugar, el token lleva **id de
sesión + generación + HMAC**, y la base guarda solo la generación vigente
(`sesiones.generacion_renovacion`). Un token con HMAC válido y generación antigua es, por
construcción, uno gastado. Y como el HMAC no se puede adivinar, **nadie puede cerrar la sesión de
otro** enviando tokens inventados: esos se rechazan sin tocar nada.

La clave HMAC **se deriva de la clave privada JWT** (HKDF). Tiene la misma frontera de confianza, y
así no hay un secreto más que gestionar. Rotar la clave privada invalida también las sesiones, que es
lo que se quiere si se rota por una filtración.

Cuando una sesión se cierra por reutilización, se guarda el motivo (`motivo_revocacion`). Así la
persona legítima, al renovar, recibe **"por seguridad cerramos tu sesión… si no fuiste tú, cambia tu
contraseña"** y no un simple "tu sesión terminó". Un cierre normal no se anuncia como incidente.

### Qué cierra la renovación y qué no

- **La cierran:** cerrar sesión, cambiar o restablecer la contraseña, desactivar o eliminar la
  cuenta, bloquearse desde la sesión (§15), la reutilización, y 30 días sin uso.
- **No la cierra el bloqueo de CU-027D por intentos desde fuera.** Ese bloqueo frena a quien prueba
  contraseñas; echar por eso a quien ya estaba dentro sería darle al atacante un botón para
  desconectar a cualquiera.
- **Un cambio de roles** llega al resto de servicios como mucho 15 minutos después: lo que tarde en
  caducar el acceso vigente.

### Costes asumidos

- **Dos renovaciones simultáneas con el mismo token se tratan como robo** y cierran la sesión. La app
  hace una sola renovación a la vez, así que solo debería pasar ante un problema real.
- **Si se pierde la respuesta de una renovación** (la red cae justo después de que el servidor la
  procese), la app se queda con el token viejo; al usarlo, la sesión se cierra por seguridad y hay
  que volver a entrar. Es un fallo seguro, y raro.
- **Las sesiones anteriores a este cambio** no tienen fecha de renovación: terminan cuando caduca su
  token, como antes.

---

## 22. En la web, el token de renovación va en una cookie `HttpOnly`

La app móvil guarda el token de renovación en el llavero del teléfono. En un navegador no hay
equivalente: lo que guarde JavaScript (`localStorage`, `sessionStorage`, memoria) lo puede leer
cualquier script inyectado en la página (XSS), y un token que abre la sesión durante 30 días es
justo lo que un atacante querría llevarse.

**Decisión:** para los clientes web, el servidor entrega el token de renovación en una cookie y lo
**quita del cuerpo**:

```
Set-Cookie: hxc_renovacion=…; HttpOnly; SameSite=Strict; Path=/api/v1/sesiones; Expires=…
            (+ Secure en producción)
```

- **`HttpOnly`:** JavaScript no puede leerla.
- **`Path=/api/v1/sesiones`:** solo viaja a las rutas de sesión, no en cada petición.
- **`SameSite=Strict`:** ninguna página de otro sitio puede hacer que el navegador la envíe.
- **El token de acceso** (15 min) sí lo recibe el portal, y lo guarda **solo en memoria**. Al
  recargar la página se recupera con la cookie.

**Quién es web** lo dice la cabecera `X-Hexacore-Cliente: web`. Sin ella, la cookie se ignora, y
como es una cabecera no estándar, el navegador exige una comprobación CORS previa: otra página no
puede enviarla. Es la protección contra CSRF, además de `SameSite`. La app móvil no envía la
cabecera y sigue igual.

**CORS:** con cookies no vale `Access-Control-Allow-Origin: *`; los orígenes permitidos se nombran en
`CORS_ORIGENES` (por defecto, los portales en 4200 y 4201). Detrás del API Gateway, portal y API
compartirían origen y esto dejaría de hacer falta.

**Detalles:**

- **Cookie que ya no sirve:** si falla la renovación, el servidor la borra. Si no, el navegador la
  enviaría en cada recarga.
- **Cerrar sesión** también la borra.
- **Visitante o sesión cerrada:** renovar **sin ningún token** responde `SIN_SESION`, distinto de
  `SESION_TERMINADA`. Así el portal distingue a un visitante (no avisa nada) de alguien cuya sesión
  se cerró mientras la página estaba cerrada (le explica por qué vuelve al login).

---

## 7. Los tokens se firman con RS256, no con un secreto compartido

*Revisada en el paso 7.* Al principio se firmaban con HS256 y un secreto (`AUTH_JWT_SECRETO`). Eso
funciona mientras solo este servicio verifica tokens, pero RNF-06 exige que **todos** los
microservicios los comprueben, y con HS256 verificar y firmar usan la misma clave: cada servicio que
verifica tokens podría **fabricar uno de administrador**. Con seis microservicios, seis sitios por
donde filtrar la llave maestra.

**Decisión:** RS256. La clave **privada** solo la tiene este servicio; los demás reciben la
**pública**, que solo sirve para verificar.

**Al arrancar se comprueba que:**

- en producción las dos claves estén configuradas (`AUTH_JWT_CLAVE_PRIVADA_ARCHIVO`,
  `AUTH_JWT_CLAVE_PUBLICA_ARCHIVO`) y **no sean las del repositorio** — se reconocen por la huella de
  la pública, escrita en el código para que la comprobación funcione aunque el archivo no exista;
- sean RSA de al menos 2048 bits;
- la pública corresponda a la privada. Si no, este servicio emitiría tokens que ningún otro podría
  verificar, y el fallo aparecería lejos, como un 401 inexplicable en la reventa.

En desarrollo se usan las de `App/infra/claves-desarrollo/`, y el servicio **avisa en el log**.

**Los verificadores fijan el algoritmo.** Si aceptaran el que declara el token, uno con
`alg: HS256` "firmado" usando la clave pública —que es pública— como secreto HMAC pasaría la
verificación. Hay una prueba para ese ataque.

---

## 16. Cerrar sesión se anuncia en Redis, dentro de la misma transacción

Los demás servicios verifican el token con la clave pública, sin preguntar a este: es lo que los
hace independientes. El precio es que no se enteran de que una sesión se cerró. Un token robado
seguiría abriendo la reventa hasta caducar, aunque la persona hubiera cerrado sesión o cambiado la
contraseña precisamente por eso.

**Decisión:** cada sesión cerrada se publica en Redis (`sesion-revocada:<jti>`) con una vida igual a
lo que le queda al token más 60 s de margen para relojes desfasados. Así la lista no crece: cuando la
clave desaparece, el token ya caducó por sí solo. ADR-03 ya prevé Redis para "sesiones".

**Dentro de la transacción, y si falla, falla todo.** La alternativa —marcar la sesión cerrada en la
base y seguir aunque Redis no responda— le diría a la persona "sesión cerrada" mientras su token
sigue valiendo en el resto del sistema. Se prefiere un error honesto (`503
REVOCACION_NO_DISPONIBLE`). Lo mismo vale para el cambio de contraseña: si no se pueden cerrar las
otras sesiones en todas partes, la contraseña no cambia.

**La base es la fuente de verdad; Redis, una copia reconstruible.** Al arrancar se vuelven a publicar
todas las revocaciones vigentes, por si Redis perdió sus datos. Y como Redis es compartido, **nadie
debe hacer `FLUSHALL`**: las pruebas del CU-006 lo hacían y se cambiaron para borrar solo sus
claves.

**La semilla de desarrollo** hace `TRUNCATE` de usuarios, que borra las sesiones en cascada. Antes de
hacerlo anuncia las abiertas como revocadas; si no, el token guardado en el móvil dejaría de valer
aquí y seguiría valiendo en la reventa.

**CU-027B (desactivar cuentas)** llama a `SesionesService.revocarTodas` dentro de su transacción:
la persona desactivada no puede volver a entrar y sus sesiones abiertas se cierran también en la
reventa (ver §20).
