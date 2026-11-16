# Demostración A/B/C por ZeroTier

Herramientas ejecutables sobre la arquitectura existente, **16/11/2026**.
La implementación y las pruebas locales de herramientas no acreditan una prueba
entre computadores. Faltan equipos/direcciones/certificados reales. Estos guiones
no instalan ZeroTier, unen nodos, cambian firewalls o administran Redash.
La caída de B es **manual**; A debe permanecer encendido.

## Alcance y requisitos

| Equipo | Contenido del montaje exclusivo |
|---|---|
| A | PostgreSQL, Redis, RabbitMQ/vhost, pasarela/correo **simulados**, preparación SQL, una instancia Núcleo/Boletería, un Trabajador, gateway, portales y Caddy HTTPS |
| B | **Solo Núcleo y Boletería**; mismas credenciales, claves, base, Redis y vhost de A. Sin preparación, semillas, datos, gateway, portales ni Trabajador |
| C | Navegador, Python 3.10+ y ZeroTier del participante. URL HTTPS estable de A; observador de lecturas públicas/autenticadas |

A/B: Python 3.10+, Docker local/Compose con `config --format json`, OpenSSL,
repositorio en `feature/sebastian` y **el mismo commit limpio**. Se soporta el
guion de equipos en macOS/Linux; Windows requiere WSL2 y comprobar sus rutas desde
Docker. El observador usa la biblioteca estándar de Python. No se usa `sudo`
automático, Docker remoto o contexto SSH. No hay Swarm/Kubernetes ni un sistema
nuevo de sesiones, pagos o trabajos.

Las guardas de arranque exigen memoria asignada a Docker de **6144 MiB en A** o
**3072 MiB en B**, y capacidad restante estimada (presupuesto 4096/1536 MiB menos
consumo propio, mínimo 512). Son presupuestos preventivos del montaje, no medidas
de capacidad ni certificación RNF. Considerar además RAM del sistema operativo,
CPU, disco y otros procesos; A debería disponer de un equipo con más capacidad
que el Mac local de 8 GiB. No se cambian límites globales ni se detienen proyectos
para satisfacer las guardas. Un `detectar` no selecciona rol.

## 1. Datos que acuerdan los tres participantes

1. Identificador nuevo de demo, responsables y computadores A/B/C dedicados a la
   ventana; OS/arquitectura/RAM/CPU, Docker/Compose y espacio de disco.
2. Red **privada** ZeroTier autorizada por su propietario e IP RFC1918 realmente
   asignada a cada miembro. Cada participante instala/se une personalmente si
   hace falta. No usar direcciones de ejemplos como si fueran asignaciones.
3. Dos nombres DNS para los portales, que C resuelva **solo a A**, y puertos
   disponibles. Certificado con SAN para ambos nombres, cadena y privada en A;
   CA confiable en C y su navegador. B no recibe privada TLS de A.
4. Mismo SHA limpio A/B, secretos propios compartidos por canal seguro, y
   disponibilidad de rutas **desde contenedores**. Docker Desktop usa una VM:
   el ping entre anfitriones no acredita rutas desde esa VM.
5. Un evento publicado/vigente y una cuenta exclusiva verificada del montaje,
   creados por las interfaces existentes. No importar bases o cuentas habituales.
   La cartelera debe ser no vacía para acreditar datos compartidos en la puerta
   de la demo. No se ejecuta ninguna semilla automáticamente; para obtener las
   primeras cuentas de un ámbito vacío existe la opción explícita de A del paso3.
6. Confirmar autorización del apagado de **todo B** y ausencia de trabajo ajeno
   que se pueda perder. Elegir un B dedicado. El guion no apaga computadores.

Los ejemplos [equipo.example.json](equipo.example.json) y
[cliente.example.json](cliente.example.json) contienen **marcadores inválidos**:
deben reemplazarse; no son un despliegue listo sin datos. Los puertos son
parametrizables. Se publican solo en la IP ZeroTier del rol: A, HTTPS y cinco
proveedores; B, 3002/3001 por defecto. No se publica la consola AMQP, gateway
HTTP, apps locales de A, portales directos ni Trabajador.

**Redis actual no implementa contraseña en sus clientes.** Por eso el montaje
requiere una red privada con miembros controlados y reglas efectivas de red/host
que limiten los cinco puertos de proveedores a A/B; C solo necesita HTTPS.
No se abre una interfaz pública ni se desactiva el firewall. La pertenencia a
ZeroTier no sustituye esas restricciones. Acordarlas/verificarlas con el dueño
de cada equipo; estas herramientas no cambian reglas. Si Docker no puede enlazar
una IP del host o los contenedores no alcanzan la VPN, se bloquea la ejecución:
no sustituir la IP por `0.0.0.0` ni desactivar verificaciones.

## 2. Configurar y construir sin afectar instalaciones anteriores

Todos los comandos se ejecutan desde la raíz de HEXACORE. Los nombres de rutas
entre `<…>` son datos por completar; usar un directorio privado nuevo por rol.

```bash
python3 App/infra/zerotier/equipo.py detectar
# Elegir rol con el equipo, no deducirlo del computador que ejecuta detectar.
ZT_PRIVADO="$HOME/.hexacore-zt/<IDENTIFICADOR>"
mkdir -p "$ZT_PRIVADO"
chmod 700 "$ZT_PRIVADO"
```

**A**, una vez y solo sobre un directorio de secretos inexistente:

```bash
python3 App/infra/zerotier/equipo.py crear-secretos --destino "$ZT_PRIVADO/secretos"
cp -n App/infra/zerotier/equipo.example.json "$ZT_PRIVADO/a.json"
# Editar a.json: rol A, direcciones/nombres reales, secretos y rutas TLS reales.
python3 App/infra/zerotier/equipo.py configurar --config "$ZT_PRIVADO/a.json" --directorio "$ZT_PRIVADO/montaje-a"
python3 App/infra/zerotier/equipo.py validar --directorio "$ZT_PRIVADO/montaje-a"
python3 App/infra/zerotier/equipo.py construir --directorio "$ZT_PRIVADO/montaje-a"
```

Se generan RSA3072, credenciales independientes de PostgreSQL/RabbitMQ y claves
internas/HMAC. No se sobrescriben secretos existentes. Transferir `secretos/` a B
mediante un canal seguro, con su participación; conservar directorio700 y archivos
de credenciales/privadas600. No publicar ni transferir la privada TLS de A a B/C.
La pública JWT y el SQL inicial sin credenciales usan644 para njs/UID postgres,
dentro de un directorio host700; las privadas siguen600. Cada Núcleo usa el UID/GID local para leer su
montaje de la privada, cuya lectura comprueba la sonda antes del arranque.

**B**, con esos mismos secretos y SHA:

```bash
cp -n App/infra/zerotier/equipo.example.json "$ZT_PRIVADO/b.json"
# Editar: rol B, mismos valores compartidos, su ruta de secretos y tls: null.
python3 App/infra/zerotier/equipo.py configurar --config "$ZT_PRIVADO/b.json" --directorio "$ZT_PRIVADO/montaje-b"
python3 App/infra/zerotier/equipo.py validar --directorio "$ZT_PRIVADO/montaje-b"
python3 App/infra/zerotier/equipo.py construir --directorio "$ZT_PRIVADO/montaje-b"
```

`configurar` reutiliza el resultado de `docker compose … config --format json`
del Compose base, conserva Dockerfiles/healthchecks y selecciona los servicios
permitidos. Quita nombres fijos, perfiles, dependencias y publicaciones anteriores;
asigna nombres, etiquetas, imágenes, red y volúmenes **hxc-zt-<demo>-a/b** propios.
El Compose JSON privado queda sellado con hashes y propietario aleatorio. No
hereda `.env`, `HOST_*`, `COMPOSE_*`, Stripe o SMTP del anfitrión. `validar` solo
valida configuración: no acredita arranque, salud o comunicación distribuida.

El archivo de configuración contiene rutas, no valores de credenciales. Compose
y el manifiesto resultantes sí son privados. Se rechazan directorios del repo
salvo `App/infra/zerotier/.privado/`, que Git ignora. Fuera del repo usar un
directorio privado nuevo; no guardar configuraciones reales junto a los ejemplos.

## 3. Preparar SQL una vez, iniciar y comprobar

**A**:

```bash
python3 App/infra/zerotier/equipo.py preparar --directorio "$ZT_PRIVADO/montaje-a" --cuentas-demo
python3 App/infra/zerotier/equipo.py iniciar --directorio "$ZT_PRIVADO/montaje-a"
python3 App/infra/zerotier/equipo.py estado --directorio "$ZT_PRIVADO/montaje-a"
```

`preparar` levanta los cinco proveedores propios, ejecuta el CLI SQL existente
de `preparacion-base`, espera salida0 y guarda la referencia de preparación.
En esta revisión: **once esquemas de negocio y 36 migraciones**, frente a las
18 fuentes originales conservadas. El guion lee el registro vigente, no ejecuta
las cifras históricas como instrucciones. La base nueva tiene nombre por demo,
en un PostgreSQL/volumen exclusivo. No se transfieren bases habituales.

La opción **explícita** `--cuentas-demo` reutiliza solo el CLI de Identidad existente
para las primeras cuentas, después de comprobar que todas las tablas de negocio
están vacías (salvo roles e historiales de migración). Ese CLI contiene TRUNCATE:
por eso se rechaza si hay cualquier dato. El guion de preparación solo se monta
en A; B no tiene una acción que lo invoque. Las imágenes comunes conservan los
CLI existentes, lo que no equivale a impedir acciones manuales de un administrador
con acceso a Docker. Solo el hijo de
fixtures usa `NODE_ENV=development`, requerido por su guarda; las apps conservan
`production`, cookies Secure y HTTPS. Las contraseñas de fixtures son conocidas:
usar exclusivamente este ámbito aislado y conservar su salida solo en el log
privado600 `preparacion-*.log`. No se incluyen contraseñas en los ejemplos.

Sin la opción se preparan únicamente esquemas; se requiere resolver las cuentas
por los flujos/procedimientos existentes antes de la demo. No se puede añadir la
opción sobre una preparación ya terminada sin cuentas ni resembrar datos.
No se ejecutan semillas de Ventas, Eventos, Alimentos u otros módulos.

La marca operativa `migracion_control.demo_zerotier` registra demo/SHA y
EN_CURSO/LISTA; no es una migración de negocio adicional. B verifica LISTA y la
misma fuente antes de arrancar. Un fallo de la inicialización conserva EN_CURSO
y bloquea la repetición automática: diagnosticar, sin resetear o borrar la marca.

Una referencia completada evita repetir SQL. Si falla, se conservan contenedores,
datos y diagnósticos; revisar la causa antes de volver a invocar manualmente.
No hay reset, `down -v` o purga. `iniciar` usa `--no-deps --no-build`:
no vuelve a arrancar la preparación por una dependencia de Compose. B carece del
servicio y su comando `preparar` se rechaza antes de operar Docker.

**B**, después de A preparado:

```bash
python3 App/infra/zerotier/equipo.py iniciar --directorio "$ZT_PRIVADO/montaje-b"
python3 App/infra/zerotier/equipo.py comprobar --directorio "$ZT_PRIVADO/montaje-b"
python3 App/infra/zerotier/equipo.py estado --directorio "$ZT_PRIVADO/montaje-b" --salida "$ZT_PRIVADO/estado-b-antes.json"
```

La sonda previa usa la imagen de Núcleo con **entrypoint Node y solo sonda**,
sin arrancar Nest/cron/consumidores: SELECT de marca/historiales en PostgreSQL, PING
Redis, conexión autenticada al vhost AMQP y `/salud` HTTP de correo/pasarela.
Verifica las claves montadas. Después, `comprobar` la ejecuta **dentro del Núcleo
que está corriendo**. No usa únicamente la conectividad del anfitrión.

**A**, una vez B iniciado:

```bash
python3 App/infra/zerotier/equipo.py comprobar --directorio "$ZT_PRIVADO/montaje-a"
python3 App/infra/zerotier/equipo.py estado --directorio "$ZT_PRIVADO/montaje-a" --salida "$ZT_PRIVADO/estado-a-antes.json"
```

Comprueba proveedores desde su Núcleo y ambos destinos de B **desde el contenedor
gateway**, además de `nginx -t`. Si B está degradado se informa fallo. La salud
sirve de precondición, **no acredita que B atendiera solicitudes de C**. Copiar
ambos estados a C con autorización; usar archivos nuevos para nuevas ventanas.

Para crear los datos propios, abrir los portales existentes por HTTPS y usar sus
flujos de registro/verificación y publicación. La bandeja del correo simulado
es solo del ámbito: puede consultarse en A desde su contenedor, sin publicar un
proveedor en Internet. No ejecutar los guiones históricos con semillas/borrados.

## 4. HTTPS y sesiones

El Caddy existente se reutiliza con certificados **provistos** (sin obtener CA o
certificados automáticamente). Se valida cadena, SAN de ambos nombres, par y
vigencia de al menos una hora antes de configurar A. API `/api/v1` en el mismo
origen de cada portal; se monta el `configuracion.js` relativo existente. No se
necesita ampliar CORS ni cambiar contratos de renovación.

En C, instalar la CA legítima en el navegador/sistema solo con participación de
su dueño cuando sea privada; con CA pública usar la confianza del sistema.
`cliente.py comprobar` verifica nombre, cadena, ruta DNS a A y conexión TLS; la
comprobación visual en navegador debe hacerse también, sin excepción de
certificado. No se usa `-k`, `CERT_NONE` ni `check_hostname=False`.

Núcleos comparten privada JWT/emisor/base, gateway y Boleterías la pública.
`NODE_ENV=production` conserva cookie de renovación Secure/HttpOnly/SameSiteStrict.
No hay afinidad de sesión. La guarda sigue comprobando Redis/permisos vigentes;
auth_request, njs, rutas sensibles y parámetros SSE no se reescriben. Se conserva
el aforo de Cola25 del Compose base (el default del código es100); solo Núcleo
recibe el secreto del webhook, como en el contrato de configuración vigente.

El gateway mezcla destinos locales Docker y B explícito. Mantiene X-Servidor y
añade X-Demo-Solicitud; logs JSON con ese ID, ruta sin query, estado, upstream y
tiempo, sin Authorization/cookies/body. `proxy_next_upstream off` y un intento:
un fallo no se reenvía a otra réplica, tampoco una escritura financiera. Se
conservan conexión5s/HTTP35s y lectura SSE1h/buffering desactivado. `max_fails=1`,
`fail_timeout=10s` son detección pasiva; DNS5s no es cota de recuperación.
SSE ligado a B termina al perder su conexión: el contrato de reconexión del
consumidor existente se conserva, no se migra el flujo entre procesos.

## 5. C: registro continuo y puerta de apagado

Copiar el ejemplo de C a su directorio privado; completar fuente común, IP A/B/C,
nombres/CA y `puertos_b` de la configuración de equipos. `upstreams_a` se copia
del estado de A (IP Docker y puerto de cada programa, sin inventarlas). Mantener
su navegador abierto en la URL estable de A con una cuenta propia; anotar antes
y después que conserva origen y sesión. El registro HTTP acredita su sesión
propia; no se atribuye automáticamente al navegador una comprobación que este
no hizo.

```bash
python3 App/infra/zerotier/cliente.py comprobar --config "$ZT_PRIVADO/c.json"
# cuenta.json privado600: {"email":"<CUENTA_EXCLUSIVA>","contrasena":"<SECRETO>"}
python3 App/infra/zerotier/cliente.py sesion --config "$ZT_PRIVADO/c.json" --credenciales "$ZT_PRIVADO/cuenta.json" --salida "$ZT_PRIVADO/sesion-c.json"
python3 App/infra/zerotier/cliente.py iniciar --config "$ZT_PRIVADO/c.json" --sesion "$ZT_PRIVADO/sesion-c.json" --directorio "$ZT_PRIVADO/registro-01" --duracion 180
```

Login explícito una vez, sin reintento. El observador usa siempre ese token y
URL, no hace login/renovación automáticos ni sigue redirects. Rechaza una sesión
que no cubra la ventana. Dos lectores GET independientes cada0,5s: cartelera y
sesión actual, nunca compras/reembolsos. Registra inicio/fin UTC y monotónico,
duración, HTTP (0 si no hubo estado), errores, X-Servidor, correlación, huellas
de datos/identidad y sesión; no guarda respuesta completa ni token en el registro.
Cada fallo queda en JSONL y la siguiente muestra programada continúa; no repite
una muestra para reemplazarla. Ctrl+C termina conservando resultados pendientes.

En otra terminal C, mantener una lectura de logs **de A** mientras mide. Se puede
usar SSH previamente autorizado/con host key conocida; no se administra B:

```bash
# Reemplazar rutas/usuario por los acordados; no ejecutar literalmente marcadores.
ZT_A_SSH="<USUARIO_A>@<IP_ZT_A>"
ssh -T -o BatchMode=yes -o StrictHostKeyChecking=yes "$ZT_A_SSH" \
  'python3 /RUTA_REPO_A/App/infra/zerotier/equipo.py logs --directorio /RUTA_PRIVADA_MONTAJE_A --seguir' \
  | python3 App/infra/zerotier/cliente.py importar-logs --directorio "$ZT_PRIVADO/registro-01"
```

Alternativamente copiar un export reciente de `equipo.py logs` de A e importarlo
por stdin, si se puede respetar la frescura. Sin logs recientes **no se habilita**
el apagado. Los guiones no instalan SSH, copian claves ni aceptan hosts desconocidos.

Mientras las dos terminales anteriores siguen trabajando, en una tercera:

```bash
python3 App/infra/zerotier/cliente.py armar --directorio "$ZT_PRIVADO/registro-01" --estado-a "$ZT_PRIVADO/estado-a-antes.json" --estado-b "$ZT_PRIVADO/estado-b-antes.json" &&
python3 App/infra/zerotier/cliente.py marcar --evento apagar-b --directorio "$ZT_PRIVADO/registro-01" --estado-a "$ZT_PRIVADO/estado-a-antes.json" --estado-b "$ZT_PRIVADO/estado-b-antes.json"
```

La puerta comprueba el observador activo y SHA/red/roles/puertos de los estados
A/B. Exige diez respuestas recientes correctas por lectura, datos iguales en
ambas réplicas y cartelera no vacía; al menos tres respuestas de A y tres de B
por lectura correlacionadas con logs. **Las de B deben tener ≤10s**, ID/HTTP/
upstream iguales y relojes UTC compatibles (≤2s de diferencia con el log). Cada
ID corresponde a una solicitud real de C. No basta una sonda saludable. Armado
vence en5s y la marca vuelve a verificar el tráfico, sin emitir peticiones extra.

**En ese momento el compañero de B apaga manualmente el computador B.** C sigue
midiendo y conserva su URL/token. No usar `parar` como sustituto del apagado
acordado ni ejecutar un kill automático. Cuando se constate físicamente el apagado,
registrarlo desde C (fecha declarada por el operador, no una detección infalible):

```bash
python3 App/infra/zerotier/cliente.py marcar --evento b-apagado --directorio "$ZT_PRIVADO/registro-01" --estado-a "$ZT_PRIVADO/estado-a-antes.json" --estado-b "$ZT_PRIVADO/estado-b-antes.json"
# Al finalizar la duración, o después de Ctrl+C conservando las muestras:
python3 App/infra/zerotier/cliente.py informe --directorio "$ZT_PRIVADO/registro-01"
```

El informe conserva todos los códigos/errores, solicitudes en curso/interrumpidas
y sin final, latencias, intervalos entre éxitos, primera respuesta posterior de A
y décima A consecutiva por lectura. Comprueba identidad y huellas de datos frente
a la línea base, e informa si B respondió después del apagado confirmado. No
descarta el fallo inicial ni lo convierte en200 con reintentos. Los tiempos son
observacionales: periodo/timeout y marca humana limitan la precisión. No declarar
recuperación si no hay diez A consecutivas; un informe parcial no es disponibilidad
mensual ni prueba de caída de A.

## 6. Convivencia real de réplicas

Los bootstraps normales se conservan; el segundo Núcleo y Boletería arrancan sus
consumidores y temporizadores, no solo HTTP:

| Mecanismo actual | Convivencia / límite |
|---|---|
| Ventas: expiración de reservas; Postventa: publicaciones | Cron con candados Redis existentes 50/60s; no es garantía global de ejecución única si una tarea supera su lease |
| Outbox de Ventas/QR, eventos.gestion, ingresos | Filas SQL/locks y consumidores sobre colas compartidas; reentrega posible entre publicar/confirmar. Monitoreo deduplica ingreso en SQL |
| Evacuación | Despacho prioritario con SKIP LOCKED y reintentos; no garantiza entrega física a dispositivos |
| Logística | Consumidores competidores y deduplicación/intentos **en memoria**, perdida al reiniciar; no afirmar deduplicación durable |
| Alimentos: reservas, ajustes y cancelaciones | Sondeos5s; guardas/bloqueos SQL e intenciones/Lua idempotentes existentes. Ajustes ejecuta recuperación al arrancar. Su convivencia completa ante fallos de dos equipos **no está certificada** |
| Correo | Solo un Trabajador en A. Límites/reentrega existentes F15 conservados; simulador, sin SMTP real |

Usar datos nuevos sin pendientes financieros, pedidos o publicaciones vencidas;
no provocar escrituras financieras ni reintentar resultados inciertos durante
la caída. F12 no se implementa. El consumo de turnos njs sigue llamando a la
Boletería **local de A**, como el contrato existente; no se promete continuidad
de compras si cae esa instancia. PostgreSQL/Redis/RabbitMQ/gateway/HTTPS/A siguen
siendo puntos únicos de fallo. La demo de B no es tolerancia a cualquier caída.

## 7. Parada y diagnóstico exclusivamente propios

```bash
# Cada compañero ejecuta en su equipo y con el directorio de su rol:
python3 App/infra/zerotier/equipo.py estado --directorio "$ZT_PRIVADO/montaje-a"
python3 App/infra/zerotier/equipo.py parar --directorio "$ZT_PRIVADO/montaje-a"
# En B, cuando vuelva a estar disponible, usar montaje-b.
```

Solo `compose stop` con lista cerrada de servicios, comprobando propietario,
checkout y etiquetas de contenedores/red/volúmenes. No down, prune, volumen -v,
kill, escalado, `--remove-orphans` ni comandos sobre proyectos ajenos. Credenciales,
datos y archivos previos permanecen. Bloqueo de operación impide arranques/paradas
concurrentes; un lock residual requiere inspección manual del PID y conservar su
diagnóstico, no borrado automático. Si cambia fuente/contexto/configuración,
se rechaza operar hasta revisar, no se fuerza una actualización.

Errores de Compose se guardan en `montaje-*/fallos/*.json` privado, con salida
original; no se publican credenciales en stdout. Un timeout puede haber dejado
parte de los servicios propios iniciados: consultar estado antes de repetir.
Ningún fallo autoriza detener Redash u otro proyecto. Logs, sesión, certificados,
estados reales y registros C quedan fuera de Git/Brightspace salvo resumen saneado.

## Validación y documentación oficial

```bash
# Sin crear contenedores o provocar caídas locales:
python3 -m unittest discover -s App/infra/zerotier -p 'test_*.py' -v
node --test App/infra/zerotier/preparacion-demo.test.cjs
node --check App/infra/zerotier/sonda.cjs
```

Las pruebas usan IP ficticias y HTTPS en loopback con CA temporal confiada solo
por ellas. Incluyen fallos TLS/nombre, HTTP503/redirect sin retry, continuidad del
registrador, puerta sin tráfico/logs, frescura, sesión/datos y rechazo de recursos
ajenos. Compose se valida con su cliente, sin arranque. La prueba de
`prueba_gateway_ci.py` corre **solo en GitHub Actions**: Nginx/njs/Caddy reales,
dos dobles Node en una red efímera, escritura interrumpida una sola vez y caída
de un doble, con limpieza de sus propios IDs/etiquetas. No es A/B/C reales por
ZeroTier ni repetición de los recorridos/matrices de negocio.

Se reutiliza la evidencia de Seguridad 167/167 y sus regresiones/SSE con sus
límites, sin certificar RNF-05/06 completos o todas las combinaciones nuevas.
Resultados exactos e incidencias de esta entrega en
[PLAN-DEMO-ZEROTIER.md](../../../Documentation/Work/PLAN-DEMO-ZEROTIER.md).

Referencias primarias consultadas (16/11/2026):
[ZeroTier CLI](https://docs.zerotier.com/cli/),
[alta y autorización de miembros](https://docs.zerotier.com/start/),
[configuración del cliente](https://docs.zerotier.com/config/),
[ZeroTier y Docker](https://docs.zerotier.com/docker/),
[Nginx proxy_next_upstream](https://nginx.org/en/docs/http/ngx_http_proxy_module.html#proxy_next_upstream),
[Caddy TLS](https://caddyserver.com/docs/caddyfile/directives/tls) y
[Caddy reverse_proxy](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy).
`listnetworks`/`info` consultan el nodo local; red/autorización se acuerdan con
el controlador y los participantes. No se ejecutan join/leave/set. ZeroTier
en los hosts no vuelve único el DNS bridge de Docker ni instala confianza HTTPS.
