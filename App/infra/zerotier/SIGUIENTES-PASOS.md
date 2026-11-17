# Después del diagnóstico inicial: A y B

Estado 16/11/2026: diagnóstico inicial recibido, **sin arranque de la demo nueva**.
C sigue siendo solo navegador/registrador. Las lecturas siguientes las ejecutan
los propietarios en A/B; no hay SSH supuesto. Direcciones/red, nombres de host,
rutas reales de usuario y JSON de montaje se conservan fuera de Git.

Samuel administra B desde A; **no está confirmado** que pueda encenderla cuando
esté completamente apagada desde la plataforma universitaria. No ejecutar caída,
reinicio, desconexión de ARPUJ o apagado para comprobarlo.

## Qué acreditan las salidas recibidas

| Equipo | Resultado observado | Pendiente antes de construir |
|---|---|---|
| A, Mac Samuel | `develop` limpio en c4c5793; Python3.15.2/OpenSSL3.5.9; Engine28.4.0 arm64, Compose2.39.2-desktop.1, contexto desktop-linux | Copia exclusiva en `main`, SHA común, CPU/RAM física, disco del motor y puertos alternativos |
| A, capacidad | Docker7.654GiB; 22 contenedores suman≈1044MiB y dejan≈6794MiB estimados por stats. Supera mínimos6144MiB y4096MiB restantes en esa instantánea | No acredita pico de construcción/uso del SO. Host35GiB disponibles/92% usado; no informa libre dentro del disco de la VM Docker |
| A, servicios previos | Puertos de datos predeterminados ocupados; aplicaciones/monitoreo y otros recursos activos | Conservarlos. No detener, recrear, reconfigurar ni borrar para liberar puertos |
| B, VM Javeriana | `main` limpio; solo SHA corto de captura, falta completo; Python3.10.12/OpenSSL3.0.2; cliente Docker29.1.3 amd64 | Copia exclusiva; consultar daemon/CPU/stats/disco. Docker permission denied no significa daemon detenido |
| B, herramientas | Socket Docker denegado, authtoken ZeroTier no legible, `docker compose` desconocido | Resolver acceso autorizado y origen/paquete del plugin. No reinstalar Engine ni abrir permisos del socket/token |
| B, capacidad | VM11913MiB, disponible5854MiB, swap usada1253MiB; raíz44GiB disponibles | MemTotal/uso del daemon, DockerRootDir y su almacenamiento. No inferir aprobación del motor desde RAM de la VM |
| Red | Pings C→A/B5/5 informados, rutas A→B y B→A por ZeroTier; A PRIVATE/OK con IP recibida | ZeroTier B mediante lectura autorizada, conectividad desde contenedores y HTTP/sesión/datos reales |

## 1. Conservar develop de A y main de B

Desde cada checkout original, solo leer/conservar su SHA completo:

```bash
git status --short --branch
git rev-parse HEAD
```

**Actualización 16/11:** A y B montan **`main`**, la versión que se entrega. Antes
se usaba `feature/sebastian`, pero quedó atrás de `develop` sin los arreglos de
tiempo real (PR #60); las herramientas ahora exigen `main` (`comun.RAMA_DEMO`).

Si el destino no existe, cada propietario crea su copia exclusiva:

```bash
git clone --single-branch --branch main https://github.com/Emperador24/HEXACORE.git "$HOME/HEXACORE-demo-zt"
```

No cambiar de rama ni hacer pull/merge en los checkouts originales. Si el destino
ya existe, inspeccionarlo; no borrarlo. Si es la copia exclusiva correcta, limpia
y en `main`, actualizarla normalmente y reportar SHA:

```bash
(
set -eu
cd "$HOME/HEXACORE-demo-zt"
test "$(git branch --show-current)" = main
test -z "$(git status --porcelain --untracked-files=all)"
git remote get-url origin
git fetch origin main
git merge --ff-only origin/main
git status --short --branch
git rev-parse HEAD
)
```

Si hay divergencia o cambios, parar y conservar. Ambos deben confirmar el mismo
SHA completo limpio; no configurar con un SHA que cambie después.

## 2. A: CPU, RAM física, disco y puertos

```bash
sysctl -n hw.memsize
sysctl -n hw.ncpu
docker info --format 'MemoriaBytes={{.MemTotal}} CPU={{.NCPU}}'
docker ps --format 'table {{.Names}}\t{{.Ports}}'
```

Samuel debe consultar Docker Desktop → Settings → VM resources/Advanced, según
versión, e informar límite/uso/espacio disponible del disco del motor, además del
disco del host ya entregado. No cambiar ajustes globales ni ejecutar prune.
`detectar` informa disco del checkout; no existe una guarda automática de mínimo
de disco ni se ha aprobado ese presupuesto. Se revisa antes de construir.

Hay un mapa **alternativo propuesto** en el JSON privado, idéntico en A/B y con
HTTPS/URL de C actualizados. No son puertos declarados libres. Comprobar en A
**antes de configurar**, desde la copia nueva:

```bash
python3 App/infra/zerotier/equipo.py puertos --ip '<IP_ZT_A>' --puertos '<HTTPS>' '<POSTGRES>' '<REDIS>' '<AMQP>' '<CORREO>' '<PASARELA>'
```

Sustituir marcadores por el bloque privado recibido. `puertos` mantiene reservas
TCP temporales simultáneas y las libera, **sin listen, tráfico, Docker ni sudo**.
No usa SO_REUSEADDR; falla si una IP no es local/enlazable o un puerto está
ocupado. Salida1 indica algún fallo. No libera listeners existentes. Una reserva
exitosa no prueba reglas/firewall o rutas desde la VM Docker; el arranque vuelve
a comprobar puertos y recursos con las guardas originales. Comparar también
las publicaciones de `docker ps`: una reserva de host no acredita ausencia de
reglas NAT de Docker ni disponibilidad futura del puerto.

## 3. B: lecturas privilegiadas sin cambiar servicios

Samuel o el operador autorizado introduce su contraseña localmente, nunca en
mensajes, archivos de configuración o argv. Son lecturas, no start/restart:

```bash
nproc
sudo docker version
sudo docker info --format 'MemoriaBytes={{.MemTotal}} CPU={{.NCPU}} Root={{.DockerRootDir}}'
sudo docker stats --no-stream --format 'table {{.Name}}\t{{.MemUsage}}'
sudo docker ps --format 'table {{.Names}}\t{{.Ports}}'
sudo zerotier-cli -j listnetworks
```

Con DockerRootDir real informado, solicitar su espacio/inodos:

```bash
sudo df -h '<DockerRootDir informado>'
sudo df -i '<DockerRootDir informado>'
```

Inventariar acceso y paquetes; errores de paquete ausente se conservan:

```bash
id
getent group docker
stat -c '%A %U %G %n' /var/run/docker.sock
command -v docker
dpkg-query -W docker-ce docker-ce-cli docker.io docker-compose-plugin docker-compose-v2
apt-cache policy docker-compose-plugin docker-compose-v2
```

Si el binario no pertenece a esos paquetes, identificar su proveedor real antes
de elegir instalación. No mezclar Snap/Ubuntu/Docker CE a ciegas.

## 4. B: acceso y Compose después de revisar esas lecturas

**Docker del usuario:** si el socket pertenece a root:docker y el administrador
autoriza ese usuario, el procedimiento oficial es añadirlo al grupo existente
(solo si falta) y abrir una sesión/grupo actualizado. El grupo otorga privilegios
de administración del motor. No cambiar el socket a666 ni ejecutar todo equipo.py
con sudo, porque Git, HOME, archivos y credenciales deben conservar su usuario.

```bash
# Solo administrador, con usuario/política/grupo ya verificados:
sudo usermod -aG docker '<USUARIO_AUTORIZADO>'
```

Si ya pertenecía al grupo, no repetir usermod. Activar esa pertenencia mediante
sesión nueva, o `newgrp docker` en una terminal autorizada; no reiniciar la VM.
Después, **sin sudo**:

```bash
id
docker info --format 'MemoriaBytes={{.MemTotal}} CPU={{.NCPU}}'
docker stats --no-stream --format 'table {{.Name}}\t{{.MemUsage}}'
```

Si la política universitaria no concede ese acceso, el montaje permanece
bloqueado hasta que el administrador indique una identidad autorizada. No
copiar/borrar ~/.docker ni cambiar propiedad/permisos recursivamente.

**Compose:** elegir el paquete solo después de conocer origen y candidato:
instalación Docker CE suele proporcionar `docker-compose-plugin`; una instalación
Ubuntu puede ofrecer `docker-compose-v2`. La decisión concreta está pendiente de
dpkg/apt-cache. Antes de instalar, el administrador revisa una simulación del
paquete elegido, por ejemplo:

```bash
sudo apt-get -s install --no-upgrade --no-install-recommends '<PAQUETE_COMPOSE_ELEGIDO>'
```

Si propone retirar/actualizar Engine, containerd, red u otros servicios, no
ejecutarla: revisar otra solución con el administrador. No aplicar la guía de
instalación completa de Docker ni desinstalar paquetes existentes. La alternativa
oficial de plugin por usuario requeriría versión/arquitectura/checksum revisados
y destino inexistente; no se descarga o instala automáticamente aquí.

Tras instalación exclusiva del plugin autorizada por su dueño:

```bash
docker compose version
docker compose --env-file /dev/null -f App/infra/docker-compose.yml --profile servicios config --format json >/dev/null
```

El segundo comando solo renderiza; no crea servicios. Las herramientas requieren
`docker compose` con JSON, no una sustitución por ComposeV1. Volver a consultar
stats/capacidad sin sudo; no usar un hello-world que descargue/arranque contenedores.

**ZeroTier de B:** se mantienen token y directorio del servicio con sus permisos.
Si la CLI solo es accesible con sudo, el usuario del montaje puede habilitar
explícitamente la consulta fija y no interactiva de las herramientas:

```bash
# Propietario: autenticar según su política, antes del comando del montaje.
sudo -v
sudo -n zerotier-cli -j listnetworks
```

Más adelante, los comandos `construir`, `iniciar` y `comprobar` de B llevarán
`--consulta-zerotier-con-sudo`. Solo eleva **sudo -n zerotier-cli -j listnetworks**;
no eleva Docker/Git/Python/SQL, ni instala/une/configura redes. No hay fallback
automático, prompt o reintento. Sin autorización vigente falla antes de arrancar.
No usar -T, copiar authtoken o abrir sus permisos como atajo.

Comprobar puertos B, sin sudo y antes de configurar:

```bash
python3 App/infra/zerotier/equipo.py puertos --ip '<IP_ZT_B>' --puertos '<NUCLEO_B>' '<BOLETERIA_B>'
```

Conservar RDP/SSH/monitoreo/ZeroTier y demás servicios existentes.

## 5. Cuándo se podrá seguir

Antes de configurar/construir: mismo SHA limpio, plugin/acceso normal de Docker,
consulta ZeroTier válida, CPU/RAM/disco de A/B y sondeos de puertos aprobados.
Actualizar **copias privadas nuevas** del mapa/URL, sin editar un montaje sellado
ni sobrescribir borradores/evidencias anteriores. Los candidatos todavía no se
han probado en A/B desde este checkout C.

Después se reutiliza [ETAPAS-REALES](ETAPAS-REALES.md): TLS/CA con Samuel en A,
preparación única y datos nuevos de A, aplicaciones B, sondas **desde contenedores**,
HTTPS/navegador/registrador C y `reparto` sin armado. Con puerto HTTPS alternativo,
**ambas URLs de portales incluyen ese puerto**, igual que c.json y enlaces.
No inferir alcance desde contenedores a partir de estos pings o binds de host.

La prueba de apagado sigue bloqueada hasta confirmar responsable/procedimiento
de reencendido desde plataforma universitaria. Administrar B encendida desde A
no lo acredita. A continúa como punto único de fallo.

Fuentes oficiales consultadas:
[Docker: usuario/grupo y permisos](https://docs.docker.com/engine/install/linux-postinstall/),
[plugin Compose](https://docs.docker.com/compose/install/linux/),
[paquetes Ubuntu](https://docs.docker.com/engine/install/ubuntu/),
[ZeroTier CLI/permisos](https://docs.zerotier.com/cli/).
