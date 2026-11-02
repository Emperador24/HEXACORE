# Infraestructura de HEXACORE

Configuración preparada para Núcleo, Boletería y Trabajador desde App/backend,
con **una base POSTGRES_BD=hexacore y ocho esquemas**. Pagos es reutilizable,
con libro único y webhook solo en Núcleo. Operación sigue pendiente.
[Instalación y conexiones](../backend/README.md), [pruebas aisladas](../backend/test/base-unica/README.md).

**El entorno habitual no se ha migrado ni reiniciado.** La ejecución de esta
versión está comprobada exclusivamente sobre copias aisladas. No ejecutar este
arranque para convertir una instalación anterior: requiere corte autorizado,
respaldos, transferencia y conciliación según ESTADO-MIGRACION §22–24 y
[CORTE-Y-REVERSIÓN](../../Documentation/Work/CORTE-Y-REVERSION.md).

## Preparación y arranque previstos

En instalación nueva, revisar .env y credenciales antes de escribir. El initdb
solo crea hexacore en un volumen nuevo; un volumen existente no se transforma.
La tarea **preparacion-base** usa la imagen Núcleo, sin listener, JWT, Redis o
RabbitMQ. Crea extensiones/esquemas y reconoce/aplica los ocho historiales (18
migraciones) bajo un bloqueo de sesión. Las dos apps esperan salida 0. Ningún
Dockerfile/bootstrap aplica migraciones y los fallos impiden habilitar aplicaciones.

Los 12 servicios locales son PostgreSQL, Redis, RabbitMQ, correo y pasarela
simulados; Núcleo, Boletería, Trabajador, gateway, dos portales y preparacion-base.
El override remoto deja siete y no arranca infraestructura local. Trabajador
solo depende de RabbitMQ/correo. Boletería recibe pública JWT, sin privada/HMAC.
La preparación SQL, Núcleo y Boletería reciben el mismo destino POSTGRES_BD.

Comandos previstos **para instalación nueva o después del corte autorizado**:

```bash
cd App/infra
./iniciar.sh                       # sin semillas por defecto
./iniciar.sh --replicas 2           # Boletería; no acredita capacidad/rendimiento
./iniciar.sh --parar                # conserva datos
# Solo instalación local vacía, tras npm ci con Node 22.22.3:
./iniciar.sh --datos-demo npm
```

El script rechaza instalaciones locales anteriores detectadas; no realiza el
corte. Las semillas son explícitas, destructivas y se rechazan si cualquier tabla
de negocio contiene filas o la procedencia indica transferencia. No hay carga
automática de los SQL por bases antiguas ni alternativa sin Node.
`exportar-datos-demo.sh /ruta/privada/nuevo.dump` genera un respaldo custom de la
base única, solo lectura y sin sobrescribir archivos; no es conciliación ni corte.
Los volcados antiguos de datos-demo son históricos y no se importan con este arranque.

Modo dos máquinas, pendiente de ejecución real:

```bash
./iniciar.sh --rol datos
# En la otra máquina:
./iniciar.sh --rol servicios --datos 192.168.1.20
```

El script exporta HOST_POSTGRES/REDIS/RABBIT/CORREO/PASARELA y PUERTO_REDIS=6380.
Ambos procesos usan POSTGRES_BD común, también en modo remoto/escalado/registro.
La tarea de preparación se conecta al destino remoto antes de habilitar apps.
No cambia destinos existentes ni copia datos. No lanzar --datos-demo en este modo.

## Configuración y comprobaciones

```bash
docker compose -f App/infra/docker-compose.yml --profile servicios config -q
docker compose -f App/infra/docker-compose.yml -f App/infra/docker-compose.remoto.yml --profile servicios config -q
npm --prefix App/backend run verificar:infra
bash -n App/infra/iniciar.sh App/infra/exportar-datos-demo.sh
```

El verificador inspecciona ocho mezclas de remoto/escalado/registro, dependencias,
destinos efectivos, tarea única y límites de secretos. Una configuración válida no
acredita arranque ni publicación remota. El perfil escalado replica Boletería sin
prometer atomicidad, RNF-10 o aislamiento de capacidad PostgreSQL entre dominios.

| Pieza habitual prevista | Puerto host |
|---|---|
| PostgreSQL / Redis | 5432 / 6380 |
| RabbitMQ / consola | 5672 / 15672 |
| Pasarela / correo simulados | 3099 / 3098 |
| Gateway | 8080 |
| Núcleo / Boletería / Trabajador | 3002 / 3001 / 3006 |

Las credenciales hexacore/hexacore son de demostración. Las rutas públicas de
web/móvil se conservan. El gateway recibe solo pública JWT y envía el webhook a
Núcleo. Los puertos de integración y sus proyectos son distintos, documentados
en la guía de pruebas; no ejecutar limpiezas, semillas ni pruebas históricas
sobre estos recursos habituales.

## Imágenes y reversión

CD conserva Dockerfile, Dockerfile.boleteria y Dockerfile.trabajador del workspace;
preparacion-base reutiliza hexacore-nucleo. El override registro selecciona la
misma etiqueta para tarea y apps. `--registro <etiqueta>` solo debe usarse tras
publicar **esta versión** y preparar el corte. Las ejecuciones remotas y digests
realmente comprobados se registran en ESTADO-MIGRACION §24. En arquitectura, CD
usa arquitectura-<SHA40> y sha-<SHA40>, sin sobrescribir main/develop/latest.
[Verificación de digests en proyecto exclusivo](../backend/test/publicadas/README.md).
No se integró a develop/main ni se desplegó el entorno habitual.

Volver de imagen no revierte escrituras: antes de habilitar tráfico, conservar
bases anteriores inmóviles, respaldos y estado de broker/Redis. Después del
cambio se necesita conciliación/copia inversa autorizada; no se ha ensayado una
reversión de operaciones nuevas a ocho bases. No purgar colas ni reservas para
facilitarla. Los guiones históricos de atributos/carga pueden alterar datos o
volúmenes; no forman parte de esta validación ni certifican los RNF actuales.
