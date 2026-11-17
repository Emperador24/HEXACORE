# Despliegue futuro en producción — pendiente

**Estado confirmado por Samuel — 16/11/2026:** el servidor de presentación
**nunca se creó**. El dominio antes usado como ejemplo (`hexacore.duckdns.org`)
pertenece a un tercero; él y todos sus subdominios quedan excluidos de pruebas,
SSH, HTTPS y configuración del equipo. No se contactaron para esta revisión.

La evidencia aprobada es el **despliegue temporal de CI111**, dentro de un runner
de Actions: [ejecución](https://github.com/Emperador24/HEXACORE/actions/runs/44000569216)
y [HTML/JSON saneados](https://github.com/Emperador24/HEXACORE/actions/runs/44000569216/artifacts/14291638302).
No acredita un servidor externo, un dominio del equipo ni una instalación cloud.
[Guion para mostrarla en Actions](../../Documentation/Work/PLAN-CIERRE-SEBASTIAN.md#mostrar-el-escaneo-aprobado-en-actions).

La guía inferior es una **opción histórica no ejecutada**, para que Diego conecte
un destino futuro. Esta entrega no crea cloud, DNS, redes, certificados ni reglas
de firewall. `dominio-controlado.example.invalid` y sus subdominios son marcadores
no resolubles: no son nuestros dominios y no sirven como destinos operativos.

```text
merge a main ──► CI ──► CD: compila y publica las imágenes en ghcr.io
                              │  comprueba los digests publicados
                              ▼
                        despliegue (SSH) ──► servidor: git checkout <sha> && desplegar.sh sha-<sha>
                                                  │  si no arranca sano, vuelve a la versión anterior
                                                  ▼
                              https://<dominio>        portal de clientes  + /api
                              https://admin.<dominio>  portal administrativo + /api
```

En el servidor solo Caddy publica puertos (80 y 443). Caddy pide y renueva solo los
certificados de Let's Encrypt. PostgreSQL, Redis, RabbitMQ y los servicios quedan dentro de la red
de Docker. Cada portal sirve también `/api` en su propio dominio, así no hace falta CORS y la
cookie de sesión funciona igual que en local. Detalle en
[docker-compose.produccion.yml](docker-compose.produccion.yml) y [produccion/Caddyfile](produccion/Caddyfile).

> **Estado revisado 16/11:** Actions sí ejecuta CI/CD; la nota anterior de bloqueo
> de facturación quedó obsoleta. Publicar imágenes no acredita despliegue externo:
> el último trabajo de producción figura omitido. El usuario confirma que aún no
> existe el destino de presentación de Diego; no se ejecuta aquí ese despliegue.

## 1. Opción histórica de máquina virtual — no ejecutada

1. Crear la cuenta en https://www.oracle.com/cloud/free. Pide una tarjeta débito o crédito
   solo para verificar (retiene cerca de US$1 y lo devuelve); en la capa *Always Free* no cobra.
   - La **región de inicio** que elijas no se puede cambiar después, y las máquinas ARM
     gratis solo se crean ahí: elige la más cercana (por ejemplo, *Brazil East (São Paulo)*).
2. *Compute → Instances → Create instance*:
   - **Image:** *Canonical Ubuntu 24.04* (la variante *aarch64*).
   - **Shape:** *Ampere → VM.Standard.A1.Flex* con **4 OCPU y 24 GB** (todo lo gratis; con
     2 OCPU y 12 GB también alcanza). Debe decir *Always Free-eligible*.
   - **Networking:** crear una VCN nueva con subred **pública** y *Assign a public IPv4 address*.
   - **SSH keys:** subir tu llave pública (o descargar la que genera Oracle y guardarla bien).
   - Si sale **"Out of capacity"**, prueba otro *Availability domain* en la misma pantalla, una
     forma más chica (2 OCPU / 12 GB) o vuelve a intentar en unas horas: es lo normal en la
     capa gratis y no es un error tuyo.
3. Abrir HTTP y HTTPS en la red de Oracle: en la instancia, *Primary VNIC → Subnet → Security
   Lists → Default Security List → Add Ingress Rules*, con *Source CIDR* `0.0.0.0/0`:
   - TCP, puerto de destino `80`
   - TCP, puerto de destino `443`
   - UDP, puerto de destino `443` (HTTP/3; opcional)

   El SSH (22) ya viene abierto. Los puertos también hay que abrirlos dentro del Ubuntu, por las
   reglas de `iptables` que traen las imágenes de Oracle; de eso se encarga
   `preparar-servidor.sh`.
4. Para que la IP no cambie al reiniciar la máquina, se puede reservar: *Networking → IP
   Management → Reserved public IPs* (una reservada también es gratis).

El usuario de SSH de las imágenes de Ubuntu de Oracle es **`ubuntu`**. El CD ya publica las
imágenes también para ARM (`arm64`), así que la máquina no tiene que compilar nada.

## 2. Dos nombres controlados por el equipo — pendientes

Todavía no hay nombres de presentación confirmados. Diego debe aportar y comprobar
el control de los nombres de cliente y administración antes de configurar DNS,
TLS o destinos del escaneo. Los marcadores de esta guía son
`dominio-controlado.example.invalid` y `admin.dominio-controlado.example.invalid`;
no se presupone que exista ningún registro ni que apunten a un servidor.

Con un dominio propio basta con dos registros A (`@` y `admin`) hacia la IP; si el administrativo
va en otro nombre, se pone en `DOMINIO_ADMIN` en el `.env`.

## 3. Plantilla de preparación del servidor futuro

Plantilla informativa; sustituir los marcadores únicamente cuando exista el
servidor controlado por el equipo. No ejecutar este procedimiento en C ni para
mostrar el escaneo ya aprobado.

```text
ssh <USUARIO_SSH>@<HOST_SSH_CONTROLADO>
# En la terminal del servidor verificado y con el checkout disponible:
cd ~/HEXACORE
./App/infra/preparar-servidor.sh <DOMINIO_CONTROLADO>
```

[preparar-servidor.sh](preparar-servidor.sh) instala Docker, crea memoria swap, deja abiertos
solo los puertos 22, 80 y 443 (en Oracle, con sus reglas de `iptables`) y clona el repositorio en `~/HEXACORE`. También **genera claves JWT
propias** en `App/infra/claves-produccion/` y escribe `App/infra/.env` con el dominio. Las claves
de `claves-desarrollo/` están en git: con ellas cualquiera podría firmarse una sesión de
administrador, y en producción el gateway las rechaza.

## 4. Correo y pagos reales (opcional)

Editar `~/HEXACORE/App/infra/.env` en el servidor y descomentar el bloque de Gmail y el de Stripe
([.env.ejemplo](.env.ejemplo) explica cada variable). Los enlaces de los correos ya apuntan a
`https://<dominio>/cuenta`.

Para Stripe, el webhook va directo al servidor, sin la Stripe CLI. En el panel de Stripe →
Developers → Webhooks se agrega el endpoint `https://<dominio>/api/v1/pagos/webhook/stripe` con
los eventos `payment_intent.succeeded`, `payment_intent.payment_failed` y `refund.updated`. El
`whsec_…` que muestra Stripe se copia en `STRIPE_SECRETO_WEBHOOK`.

## 5. Plantilla de primer despliegue — pendiente

```bash
cd ~/HEXACORE/App/infra
./desplegar.sh --compilar --datos-demo   # compila en el servidor: no depende del CD
# o, cuando el CD ya haya publicado imágenes de main:
./desplegar.sh main --datos-demo
```

`--datos-demo` carga las cuentas de ejemplo (contraseña `hexacore2026`), solo si la base está
vacía. Abrir `https://dominio-controlado.example.invalid`; el primer acceso puede tardar unos segundos
mientras Caddy obtiene el certificado.

## 6. Conexión futura del CD de Diego — pendiente

1. En tu computador, una llave solo para el CD:
   ```bash
   ssh-keygen -t ed25519 -f hexacore-cd -N "" -C "hexacore-cd"
   ssh-copy-id -i hexacore-cd.pub ubuntu@dominio-controlado.example.invalid
   ssh-keyscan dominio-controlado.example.invalid > hexacore-cd.known_hosts
   ```
2. En GitHub → el repositorio → Settings → Secrets and variables → Actions:

   | Tipo | Nombre | Valor |
   |---|---|---|
   | Secret | `PRODUCCION_SSH_CLAVE` | contenido de `hexacore-cd` (la privada) |
   | Secret | `PRODUCCION_SSH_HOST` | `dominio-controlado.example.invalid` |
   | Secret | `PRODUCCION_SSH_USUARIO` | `ubuntu` |
   | Secret | `PRODUCCION_SSH_KNOWN_HOSTS` | contenido de `hexacore-cd.known_hosts` |
   | Variable | `PRODUCCION_DOMINIO` | `dominio-controlado.example.invalid` |

   Sin `PRODUCCION_DOMINIO`, el trabajo de despliegue no corre (no falla).
3. Las imágenes que publica el CD en ghcr.io pueden quedar privadas. Hay dos opciones:
   - Hacerlas públicas: en github.com/Emperador24?tab=packages, cada paquete `hexacore-*` →
     Package settings → Change visibility → Public.
   - O dejarlas privadas y agregar en el `.env` del servidor `GHCR_USUARIO` y `GHCR_TOKEN`
     (un token clásico con el permiso `read:packages`).
4. Desde ahí, cada merge a `main` pasa por el CD. El trabajo **Desplegar en producción** entra
   por SSH, pone el repositorio en ese commit, despliega `sha-<commit>` y comprueba que
   `https://<dominio>/api/v1/salud` responda.

## Operación

```bash
./desplegar.sh --estado              # versión desplegada y estado de cada contenedor
./desplegar.sh sha-<SHA40>           # volver a una versión anterior (o ir a una concreta)
docker compose -f docker-compose.yml -f docker-compose.produccion.yml --profile servicios logs -f nucleo
# respaldo de la base:
docker compose -f docker-compose.yml -f docker-compose.produccion.yml exec -T postgres \
  pg_dump -U hexacore -Fc hexacore > respaldo-$(date +%F).dump
```

Volver a una versión anterior cambia las imágenes, no los datos: las migraciones solo van hacia
delante (ver [CORTE-Y-REVERSION](../../Documentation/Work/CORTE-Y-REVERSION.md)). Si un
despliegue no llega a estar sano, `desplegar.sh` vuelve solo a la versión que estaba y el
trabajo del CD falla en rojo.

## Escaneo del destino futuro — pendiente separado de CI111

El workflow está preparado; todavía no se ha ejecutado contra un servidor de
presentación. CD conecta `owasp-desplegado.yml` después de `despliegue`, incluida verificación
de las ocho aplicaciones activas por SHA OCI (`verificar-version.py`).
Gateway/Caddy exponen `/version`, revisado antes y después del ZAP pasivo.
No basta con `.version-desplegada` ni con la etiqueta solicitada.

Configurar `PRODUCCION_DOMINIO`, opcional `PRODUCCION_DOMINIO_ADMIN`, secretos
SSH ya descritos y `OWASP_CLIENTE_EMAIL` / `OWASP_CLIENTE_CONTRASENA` de una cuenta exclusiva de
ensayo. Tras verificar la revisión se hace un único login HTTPS, sin seguir
redirecciones, para obtener JWT nuevo al terminar el CD; no se amplía su TTL. HTTPS debe ser confiable para el runner, sin excepciones TLS. La ruta CD
automática usa main; otro despliegue docente debe llamar al workflow reutilizable
con revisión/URL de API y ambos portales después de acreditar sus contenedores.
No se configura ni opera ese destino desde esta entrega.

Reportes `owasp-presentacion`: todas las instancias saneadas en HTML/JSON, criterio
cero High; ZAP no tiene Critical. El reporte `atributos-sebastian` de CI identifica
`ci-efimero` y corresponde a otro entorno. [Guion y límites](../../Documentation/Work/PLAN-CIERRE-SEBASTIAN.md).
