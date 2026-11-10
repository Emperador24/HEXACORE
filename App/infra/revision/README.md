# Entorno local de revisión de la migración

**Desarrollo CU-015 desde `feature/sebastian`:** usar
`./App/infra/cu015.sh iniciar --datos-demo` solo sobre recursos nuevos vacíos;
después `iniciar` sin semillas. [Guía CU-015, puertos y Playwright](../../e2e/README.md).
Es otro perfil con proyecto, datos, red, claves y cookies propios. El perfil
histórico descrito abajo conserva sus destinos y su restricción de rama.

La migración (ADR-16) ya está integrada en develop mediante el PR #44. Este
entorno se conserva para revisar en aislamiento: construye las fuentes de
`feature/sebastian-arquitectura` (el guion rechaza otras ramas). Reúne
Núcleo, Boletería, Trabajador, gateway y los dos portales; correo y pasarela son
simuladores locales. No cambia el entorno habitual ni las referencias A/B.
No ejecuta el corte del entorno habitual.

## Obtener la revisión

En un checkout existente, revisar primero los cambios locales:

```bash
git status --short --branch
git fetch origin
git switch feature/sebastian-arquitectura
git pull --ff-only origin feature/sebastian-arquitectura
git rev-parse HEAD
```

Si Git rechaza el cambio/avance por trabajo local, conservarlo y resolverlo antes
de continuar. No usar reset, clean ni checkout forzado. Para revisar sin alterar
ese checkout, clonar en otra carpeta:

```bash
git clone --single-branch --branch feature/sebastian-arquitectura \
  https://github.com/Emperador24/HEXACORE.git HEXACORE-revision
cd HEXACORE-revision
```

El proyecto Docker es único por máquina y verifica el checkout propietario.
Parar el entorno desde su carpeta original antes de usar otro checkout; los
volúmenes no se adoptan automáticamente desde otra carpeta.

## Construir y arrancar

Requisitos: Git, Python 3.10+, OpenSSL y Docker Desktop iniciado (Compose **2.24.4+**,
soporte `!override`/`!reset`). La ejecución comprobada usa Docker 29.7.2,
Compose 5.3.1. Los tres backends se construyen con **Node 22.22.3** en sus imágenes;
para arrancar no se necesita Node/npm en el host. Los portales conservan su
compilador y Dockerfile propios. Tener conexión para descargar imágenes/paquetes.

Desde la raíz, **solo la primera vez**, solicitar expresamente los datos demo:

```bash
./App/infra/revision.sh iniciar --datos-demo
```

El guion comprueba rama, Docker local, configuración efectiva, propiedad de
recursos y doce puertos libres antes de construir/modificar recursos Docker.
Construye ocho imágenes **secuencialmente**, reutilizando los Dockerfiles actuales.
Ejecuta la preparación central (26 migraciones, 18 procedencias históricas), semillas existentes sobre base
vacía, inventario Redis y altas/turno de Personal a través del gateway. Incluye
la semilla vigente de Eventos/Recintos; no toma la proyección local como autoridad.
La preparación SQL se espera por su código de salida antes de iniciar apps;
`--wait` se utiliza para servicios permanentes, no para esa tarea finita.
No ejecuta `iniciar.sh`, volcados ni semillas contra destinos habituales.

Los siguientes arranques reconstruyen desde fuentes y **conservan las operaciones**:

```bash
./App/infra/revision.sh iniciar
./App/infra/revision.sh estado
./App/infra/revision.sh logs nucleo boleteria trabajador
./App/infra/revision.sh parar
./App/infra/revision.sh iniciar
```

`parar` usa stop y conserva contenedores, red y los tres volúmenes. No hay
limpieza global ni comando de restablecimiento automático. La segunda petición
`--datos-demo` se rechaza. Una carga interrumpida queda como `EN_CURSO` en
`migracion_control.revision_demo`: conservar el error/log y revisar exclusivamente
este proyecto antes de intervenir; no repetir semillas sobre datos parciales.

## URLs y credenciales exclusivamente de demostración

Abrir **exactamente `revision.localhost`** en Chrome/Edge/Firefox actual. El
navegador resuelve ese dominio reservado a loopback; no modificar hosts. Su cookie
host-only queda separada de `localhost` habitual. Todos los puertos Docker se
publican solo en `127.0.0.1`; este guion no ofrece acceso desde otro computador.
El compañero ejecuta su propio entorno desde la misma rama.

| Componente | URL |
|---|---|
| Portal cliente | http://revision.localhost:14210 |
| Portal administrativo | http://revision.localhost:14211 |
| Gateway | http://revision.localhost:18090/api/v1 |
| Buzón simulado, JSON con enlaces | http://revision.localhost:13128/correos |
| Pasarela simulada, salud | http://revision.localhost:13129/salud |
| RabbitMQ, solo revisión | http://revision.localhost:16789 (`revision_demo` / `revision_demo`) |

**Contraseña de todas las cuentas sembradas: `hexacore2026`.** Son fixtures
públicos, no credenciales de una instalación real.

| Cuenta | Uso |
|---|---|
| `cliente@hexacore.com` (Ana) | Portal cliente, entradas propias y compras |
| `bruno@hexacore.com`, `carla@hexacore.com` | Compradores distintos para reventa/concurrencia manual |
| `admin@hexacore.com` | Portal administrativo; roles Administrador y Personal |
| `personal@hexacore.com` | Luis, Personal/Entrada con turno vigente al cargar |
| `parqueadero@hexacore.com`, `restaurante@hexacore.com` | Personal de esas áreas |
| `jefepersonal@hexacore.com`, `reemplazo@hexacore.com` | Revisión/cobertura de turnos por API o móvil existente |
| `pendiente@hexacore.com`, `desactivada@hexacore.com` | Rechazos esperados de login |

Datos SQL solo demo: `127.0.0.1:15449`, base `hexacore_revision`, usuario
`revision_demo`, contraseña `revision_demo_solo_local`; Redis `:16394`, AMQP
`:15689`, vhost `revision`. Los programas usan los DNS internos, no esos puertos.
Red/proyecto/imágenes/volúmenes tienen prefijo `hexacore-revision-arquitectura`.
Claves JWT propias y configuración generada: `App/infra/revision/.estado/`, ignorado
por Git; conservar las claves al reiniciar. No compartir ese directorio ni respaldos.

## Recorridos manuales disponibles

1. Cliente: registro nuevo → abrir enlace del buzón → pulsar activar → login.
   Perfil, contraseña, recuperación y cierre de sesión usan Identidad real;
   recargar conserva la sesión mediante cookie HttpOnly y renovación.
2. Cartelera → **HEXACORE Fest 2026** → localidad/cantidad → continuar al pago.
   Se solicita y consume turno real. La pantalla permite respuestas demo del
   simulador; aprobar emite entradas consultables en `/entradas`.
3. `/pedidos` → **Food Truck La Sazón** → agregar Hamburguesa → continuar → pagar.
   Reserva inventario real y genera QR. **Guardar captura**: esta interfaz no
   recupera el comprobante de alimentos al recargar. El pedido sí persiste.
4. Ana: `/entradas` → poner una entrada publicable en reventa. En ventana privada,
   Bruno: `/reventa` → reservar → pagar → comprobar cambio de titular y QR nuevo.
   Las proyecciones conservan sus ventanas de consistencia anteriores.
5. Administrativo: login → `/admin/cuentas`, buscar cuentas y revisar los controles
   existentes. Eventos/Recintos, Personal, cambios/asistencia, monitoreo, evacuación
   y cobro/ocupación de parqueaderos tienen implementación y portal vigentes de Samuel.
   La integración de mensajes de Eventos hacia Entradas conserva sus pendientes
   documentados en el contrato. El turno demo vence seis horas
   después de cargar: su vencimiento no justifica resembrar.

Roles/permisos dinámicos, incidentes, proveedores, conciliación e informes del
administrativo siguen pendientes. CU-015 añade la gestión real de establecimientos;
CU-012–014 no se completan con ella. F12 (recuperación financiera), F13 (timeouts), F14
(limitaciones de logística) y F15 (Identidad/correo) siguen pendientes. Compartir
base no acredita atomicidad nueva ni invalidación inmediata del QR.

Los simuladores de correo/pasarela guardan su memoria solo mientras vive su
proceso: después de reiniciar puede vaciarse el buzón. PostgreSQL, Redis AOF y
RabbitMQ conservan sus volúmenes; el libro financiero es durable. No hay correo
ni cobro real y los tokens de pago del portal son fixtures.

## Comprobaciones reproducibles y reporte

```bash
python3 -m unittest discover -s App/infra/revision -p 'test_*.py' -v
python3 App/infra/revision/comprobar_http.py
./App/infra/revision.sh config  # configuración resuelta, solo claves conocidas demo
```

Para navegador: Node 22.22.3 (`nvm install 22.22.3 && nvm use 22.22.3`),
`npm ci --prefix App/frontend/portal-web-cliente`, Chrome instalado (`CHROME`
permite otra ruta). Usa Puppeteer ya declarado por el portal, sin otra plataforma:

```bash
node App/infra/revision/comprobar-navegador.mjs /tmp/hexacore-revision-capturas
HEXACORE_PORTAL=http://revision.localhost:14210 \
HEXACORE_API=http://127.0.0.1:18090/api/v1 \
HEXACORE_BUZON=http://127.0.0.1:13128/correos \
node App/frontend/portal-web-cliente/pruebas/login-portal.mjs
```

El primero crea compras reales **dentro del demo** y consume inventario/cupo; el
segundo crea su propia cuenta. No ejecutar el antiguo guion `test:reventa`: su
prehook resembraría el entorno habitual. No ejecutar suites antiguas sin revisar
destinos. Para comprobar persistencia, después de operaciones y sin más usuarios:

```bash
python3 App/infra/revision/persistencia.py guardar
./App/infra/revision.sh parar
./App/infra/revision.sh iniciar
python3 App/infra/revision/persistencia.py comparar
```

Se comparan conteos y huellas completas de 13 tablas, incluidos QR, compras,
pedidos, referencias financieras e historiales. La referencia privada no se
sobrescribe. Antes de otro ensayo, moverla expresamente fuera de `.estado`.

Registrar `git rev-parse HEAD`, `git status --short`, fecha, navegador, cuenta/rol,
URL, pasos, esperado/observado y error HTTP visible. Adjuntar capturas/logs sin
JWT/cookies/enlaces con token. Para confirmar las imágenes locales:

```bash
docker image inspect hexacore-revision-arquitectura-nucleo:local \
  --format '{{json .Config.Labels}}'
```

El SHA OCI registra la revisión construida y `hexacore.fuente.modificada` indica
cambios locales en las fuentes. Anotar ambos; no confundir fuente limpia con
aprobar todos los casos. Reportar hallazgos como issue o en el PR de la rama que los corrija.
