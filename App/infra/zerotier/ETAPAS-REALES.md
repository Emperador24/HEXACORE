# Preparación real por etapas: A, B y C

Estado 16/11/2026: **diagnóstico inicial recibido; faltan verificaciones y acceso B**.
Continuar por [SIGUIENTES-PASOS.md](SIGUIENTES-PASOS.md). No iniciar servicios todavía.
Este documento usa marcadores. El inventario con direcciones/red reales, los JSON,
certificados y credenciales permanecen **fuera de Git**. Las instrucciones se
ejecutan por los propietarios en sus equipos; no hay acceso SSH supuesto.

| Rol confirmado | Equipo | Trabajo permitido en esta etapa |
|---|---|---|
| A | Mac de Samuel | Diagnóstico y planificación de capacidad/HTTPS. Después alojará la mayor carga: proveedores, gateway/HTTPS/portales, un Trabajador y Núcleo/Boletería |
| B | VM Javeriana, Ubuntu 22.04.5 | Diagnóstico; después solo Núcleo/Boletería contra A. Samuel administra desde A; capacidad de reencendido desde plataforma no confirmada |
| C | Mac de Sebastián, este checkout | Navegador y registrador. No construir/arrancar aplicaciones, proveedores o bases locales |

Se recibieron tres IP y una red privada. Los pings C→A y C→B aprobaron **5/5
cada uno según el usuario**; Samuel informa comunicación entre servidores.
Son evidencias entre anfitriones, no desde contenedores. El rango anterior
colisionaba con ARPUJ; se usa el nuevo reparto privado y **se conserva ARPUJ**
para administrar B. No cambiar rutas globales, firewalls o membresías para probar.

## 1. Diagnóstico inicial de solo lectura, ya recibido

Las salidas de esta sección ya se recibieron. No repetirlas por rutina: completar
solo CPU/disco/puertos de A y daemon/permisos/Compose de B según SIGUIENTES-PASOS.
Los bloques inferiores se conservan como referencia de la etapa anterior.

Desde la raíz de su checkout; si no existe, informar ruta/ausencia antes de clonar.
Si falta herramienta o permiso, conservar el error. No instalar, arrancar Docker,
modificar permisos, borrar datos o detener proyectos para hacer aprobar una guarda.
Los comandos son independientes: no interpretar un error como aprobación.

**A, macOS:**

```bash
git status --short --branch
git branch --show-current
git rev-parse HEAD
python3 --version
openssl version
docker version
docker compose version
python3 App/infra/zerotier/equipo.py detectar
df -h .
```

```bash
docker stats --no-stream --format 'table {{.Name}}\t{{.MemUsage}}'
lsof -nP -iTCP -sTCP:LISTEN
zerotier-cli -j listnetworks
route -n get '<IP_ZT_B>'
```

**B, Ubuntu:**

```bash
git status --short --branch
git branch --show-current
git rev-parse HEAD
python3 --version
openssl version
docker version
docker compose version
python3 App/infra/zerotier/equipo.py detectar
free -m
df -h .
```

```bash
docker stats --no-stream --format 'table {{.Name}}\t{{.MemUsage}}'
ss -ltn
zerotier-cli -j listnetworks
ip route get '<IP_ZT_A>'
docker info --format 'Root={{.DockerRootDir}} MemoriaBytes={{.MemTotal}} CPU={{.NCPU}}'
```

Si `detectar` no existe en el SHA anterior, omitirlo y enviar el resto, sin
actualizar todavía. No publicar `docker inspect`, `compose config` completo,
`.env`, tokens ZeroTier o secretos; los estados/redes completos se comparten
solo en el canal privado del equipo. La CLI ZeroTier puede requerir permisos
adicionales: B reportó ese bloqueo. Existe una opción explícita de lectura con
sudo -n descrita en SIGUIENTES-PASOS; no se eleva todo el montaje automáticamente.

**Interpretación pendiente:** Docker A≥6144 MiB, B≥3072 MiB. Además la guarda
existente exige capacidad restante estimada: presupuesto4096/1536 MiB menos uso
propio, mínimo512. No reducir esos valores ni detener recursos ajenos para pasar.
A: revisar Docker Desktop → Settings → VM resources/Advanced (según versión),
RAM, límite/ubicación del disco y espacio real disponible; **no cambiar ajustes**.
B: consultar `df -h '<DockerRootDir informado>'` y `df -i` del almacenamiento
correspondiente; si no hay permiso, pedir esa lectura al responsable.

El código actual informa disco libre del checkout; **no impone un mínimo de disco
ni mide automáticamente el espacio libre de la VM de Docker Desktop**. Es una
revisión manual pendiente, no una guarda aprobada: registrar espacio real para
imágenes/construcción/datos y presupuesto acordado antes de construir. `docker
system df` informa uso, no espacio libre. No inventar ni relajar un umbral.

Puertos por defecto a revisar: A443/5432/6380/5672/3098/3099; B3002/3001. Un
listener global también puede colisionar. La comprobación de bind del guion se
ejecutará antes de construir/arrancar; si falla, conservar y diagnosticar.

## 2. Acordar el mismo commit limpio sin perder trabajo

**Después de revisar los diagnósticos**, fijar el SHA completo de
`origin/main` publicado por el coordinador. No usar etiquetas móviles
como evidencia de igualdad; comunicar `git rev-parse HEAD` de ambos equipos.

Si ya están en `main`, limpios y sin divergencia, sus propietarios:

```bash
git fetch origin main
git merge --ff-only origin/main
git status --short --branch
git rev-parse HEAD
```

Si hay cambios, otra rama o divergencia, **conservar ese checkout**. Usar una
copia nueva exclusiva, sin cambiar su rama ni stash/reset/clean/force:

```bash
git clone --single-branch --branch main https://github.com/Emperador24/HEXACORE.git "$HOME/HEXACORE-demo-zt"
```

El destino debe ser inexistente. Si ya existe, inspeccionarlo y acordar otro;
no borrarlo. No ejecutar estos comandos de servidores en C. Ambos deben reportar
mismo SHA, rama `main` y árbol limpio antes de configurar/construir.

## 3. Nombres internos y CA privada de ensayo, exclusivamente A

Propuesta: **hexacore.zt.test** (cliente) y **admin.hexacore.zt.test** (administración),
ambos hacia `<IP_ZT_A>`. `.test` está reservado; no requiere publicar proveedores
o solicitar un certificado público. Confirmar esos dos nombres antes de generar;
si cambian, editar **solo la copia privada** de la plantilla y los JSON.

Después del diagnóstico favorable, Samuel recibe por canal privado `reparto.env`
y `a.borrador.json`, elige su directorio privado nuevo y completa sus rutas.
`ZT_PRIVADO` es **la ruta local de A**, nunca la ruta de C recibida por copia.

```bash
export ZT_PRIVADO="$HOME/.hexacore-zt/<DEMO_ACORDADA>"
```

Crear ese directorio previamente con700 y copiar los borradores sin sobrescribir.
Los bloques siguientes se ejecutarán **en A**, con Samuel presente. El primero
solo crea un directorio HTTPS inexistente y copia las plantillas. No ejecutar
generación en C/B ni repetirla sobre archivos existentes; si queda parcial,
conservarla y diagnosticar. Los subshells se detienen ante el primer fallo.

```bash
(
set -eu
umask 077
test -d "$ZT_PRIVADO"
test ! -e "$ZT_PRIVADO/https-a"
mkdir -m 700 "$ZT_PRIVADO/https-a"
cp App/infra/zerotier/https-ca.example.cnf "$ZT_PRIVADO/https-a/ca.cnf"
cp App/infra/zerotier/https-servidor.example.cnf "$ZT_PRIVADO/https-a/servidor.cnf"
)
```

Revisar ahora las copias privadas: CN/DNS.1/DNS.2 y los nombres de los JSON deben
coincidir. Con los nombres propuestos no se requiere editar. Si se eligieron
otros, actualizar solo esas copias y los argumentos `-verify_hostname` inferiores.
Después, generar una vez; la guarda rechaza cualquier salida anterior:

```bash
(
set -eu
umask 077
cd "$ZT_PRIVADO/https-a"
for ZT_ARCHIVO in ca.key ca.pem ca.srl servidor.key servidor.csr servidor.pem
do
    test ! -e "$ZT_ARCHIVO"
done
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:3072 -aes-256-cbc -out ca.key
openssl req -new -x509 -sha256 -days 7 -key ca.key -out ca.pem -config ca.cnf -extensions ca
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:3072 -out servidor.key
openssl req -new -sha256 -key servidor.key -out servidor.csr -config servidor.cnf
openssl x509 -req -sha256 -days 2 -in servidor.csr -CA ca.pem -CAkey ca.key -CAcreateserial -out servidor.pem -extfile servidor.cnf -extensions servidor
openssl verify -CAfile ca.pem -purpose sslserver -verify_hostname hexacore.zt.test servidor.pem
openssl verify -CAfile ca.pem -purpose sslserver -verify_hostname admin.hexacore.zt.test servidor.pem
openssl x509 -in ca.pem -noout -fingerprint -sha256
)
```

OpenSSL pide la contraseña de la privada de CA al propietario; no ponerla en
argv, `.env`, Git o mensajes. `ca.key` permanece cifrada **solo en A**, fuera del
montaje Caddy; `servidor.key` es600, solo A/Caddy. No transferir esas privadas a
B/C. Solo `ca.pem`, certificado público, se transfiere a C por canal acordado;
comparar su huella SHA256 con Samuel por un canal independiente antes de confiar.

En el JSON **privado** A: `tls.certificado=<ZT_PRIVADO_A>/https-a/servidor.pem`,
`tls.privada=…/servidor.key`, `tls.ca=…/ca.pem`; secretos JWT/PG/AMQP se generan
aparte con la herramienta existente. B recibe solo esos secretos comunes con
su participación; `tls:null`. C **no recibe claves JWT ni credenciales de datos**.

## 4. Resolución y confianza: propietarios de A y C

Sin modificar ARPUJ/otras rutas, sus propietarios conservan copia de `/etc/hosts`
y agregan o corrigen **solo los dos alias** por el mecanismo autorizado de su SO:

```text
<IP_ZT_A> hexacore.zt.test admin.hexacore.zt.test
```

Conservar el resto del archivo. No usar nombres/IP de localhost o excepciones
de certificado. A y C comprueban su resolución; B usa IP explícitas a proveedores.

```bash
python3 -c 'import socket; print({h:sorted({x[4][0] for x in socket.getaddrinfo(h,443,type=socket.SOCK_STREAM)}) for h in ["hexacore.zt.test","admin.hexacore.zt.test"]})'
```

En **C**, comparar primero `openssl x509 -in '<RUTA_PRIVADA_C>/ca.pem' -noout
-fingerprint -sha256`. El propietario importa **solo esa CA** en Acceso a Llaveros,
llavero de inicio de sesión, revisa la huella y establece confianza para SSL de
esa CA. No confiar en una hoja de servidor como excepción ni desactivar TLS.
Reabrir el navegador y comprobar que ambos portales usan la cadena/nombres
esperados. Si el navegador tiene almacén propio, importar allí la misma CA con
su propietario. Al terminar el ensayo, retirar solo la confianza de esta CA
identificada por huella, conservando los demás certificados.

Python/curl pueden usar otro almacén que el navegador: `c.json.ca` debe apuntar
al `ca.pem` recibido. No asumir que importar al llavero configura Python. La CA
de siete días y la hoja de dos días son para esta ventana; si vencen, renovar
con sus propietarios antes de otra demo, sin ignorar errores de vigencia.

## 5. Secuencia posterior, bloqueada hasta recibir A/B

1. **Revisar diagnósticos** y completar discos/puertos, rol, SHA limpio común y
   permisos CLI. Si no hay capacidad, no construir ni bajar guardas.
2. **A:** puertos alternativos comprobados y mapa privado común actualizado;
   directorio/secretos nuevos, CA/TLS con Samuel, JSON final local con HTTPS alternativo también en URL de C/enlaces;
   `configurar`, `validar`, `construir`. Preparación única `preparar --cuentas-demo`
   solo sobre ámbito vacío y luego `iniciar`; todos con su `--directorio` A.
   Si falla/queda EN_CURSO, conservar y revisar antes de volver a ejecutar.
3. **B:** mismo SHA/secretos e IP propia, `tls:null`; `configurar`, `validar`,
   `construir`, `iniciar`. La sonda de B exige SQL LISTA/SHA de A y conecta a
   PostgreSQL/Redis/AMQP/correo/pasarela **desde su contenedor**, sin bootstrap
   administrativo. No iniciar proveedores, Trabajador, semillas o migraciones B.
4. **B comprobar**, después **A comprobar**: proveedores desde los contenedores,
   gateway→B para ambos programas, Nginx y salud. Exportar estados nuevos.
5. **C:** resolución y CA legítima, ambos portales HTTPS, cuenta/evento nuevos
   mediante interfaces existentes; `cliente.py comprobar`, `sesion`, `iniciar`.
   Copiar a C estados A/B y completar `fuente` y `upstreams_a` con valores reales.
   C no ejecuta comandos de montaje de servidores y no necesita Docker.
6. **A→C logs:** lectura/export acordado con Samuel, sin asumir SSH. Puede
   entregar export reciente de `equipo.py logs --directorio <MONTAJE_A>` por
   canal autorizado para importar por stdin. Si no llega fresco, falla el reparto:
   no relajar ≤10s ni correlación/relojes≤2s. Más adelante se puede acordar un
   canal continuo autorizado; no se instalan SSH ni claves desde este checkout.
7. **Comprobar tráfico A/B sin armar:** mientras el registrador C siga activo:

```bash
python3 App/infra/zerotier/cliente.py reparto --directorio "$ZT_PRIVADO/registro-01" --estado-a "$ZT_PRIVADO/estado-a-antes.json" --estado-b "$ZT_PRIVADO/estado-b-antes.json"
```

Reutiliza las mismas guardas de tráfico/datos/sesión/logs que `acreditar`; devuelve
`armado:false`, sin modificar el registro o crear marcas. No envía solicitudes
adicionales ni señala que se pueda apagar B. Salud/ping no sustituyen respuestas
recientes de negocio. Esta etapa termina con evidencia de reparto, **sin caída**.

Los comandos completos de montaje/registro siguen en [README](README.md), con
su orden y ámbitos. Son instrucciones futuras, no resultados ejecutados aquí.
Registrar por separado: ping host → conexión desde contenedores → HTTPS/sesión/
datos en funcionamiento → reparto real → caída. No saltar etapas.

## 6. Condiciones pendientes para un futuro apagado manual

No ejecutar aún `armar`, `marcar apagar-b`, `shutdown`, kill o desconexión de red.
Faltan nombre del responsable con acceso a la **plataforma de la universidad**,
identificador privado de VM, procedimiento comprobado para encenderla y permisos/
ventana sin trabajo ajeno. ARPUJ permite administrar B encendida; no demuestra
que alguien pueda encender una VM apagada desde la plataforma.

Solo después, repetir la acreditación reciente de tráfico real de C, mantener
C midiendo y acordar el apagado manual con ese responsable. A permanece como
punto único de fallo; no se certifica tolerancia a A ni disponibilidad mensual.

Referencias primarias consultadas:
[ZeroTier CLI/permisos](https://docs.zerotier.com/cli/),
[Docker Desktop: recursos de la VM](https://docs.docker.com/desktop/settings-and-maintenance/settings/),
[IANA .test](https://www.iana.org/assignments/special-use-domain-names),
[OpenSSL req](https://docs.openssl.org/1.1.1/man1/req/),
[OpenSSL x509](https://docs.openssl.org/1.1.1/man1/x509/),
[Apple: confianza de certificados](https://support.apple.com/en-euro/guide/keychain-access/kyca11871/mac).
