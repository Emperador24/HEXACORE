# Despliegue en producción

Cómo poner HEXACORE en internet con HTTPS, y cómo hacer que **cada cambio que entra a `main`
se despliegue solo**. Funciona en cualquier máquina virtual Ubuntu con 4 GB de RAM o más; abajo
va con Oracle Cloud, cuya capa gratuita da una máquina ARM de 24 GB sin costo y sin fecha de fin.

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

> **Requisito para el despliegue automático:** que GitHub Actions corra. Hoy la cuenta del
> repositorio está bloqueada por un problema de facturación y ningún job arranca; se resuelve en
> https://github.com/settings/billing. Mientras tanto se puede desplegar a mano con
> `./desplegar.sh --compilar` (paso 5).

## 1. Máquina virtual (Oracle Cloud, capa *Always Free*)

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

## 2. Dominio gratis (DuckDNS)

1. Entrar a https://www.duckdns.org con la cuenta de GitHub.
2. Crear un subdominio, por ejemplo `hexacore`, y poner la IP pública de la máquina.
3. Listo: `hexacore.duckdns.org` y `admin.hexacore.duckdns.org` apuntan a la máquina (DuckDNS
   resuelve también los subdominios del tuyo).

Con un dominio propio basta con dos registros A (`@` y `admin`) hacia la IP; si el administrativo
va en otro nombre, se pone en `DOMINIO_ADMIN` en el `.env`.

## 3. Preparar el servidor (una vez)

```bash
ssh ubuntu@hexacore.duckdns.org
curl -fsSL https://raw.githubusercontent.com/Emperador24/HEXACORE/main/App/infra/preparar-servidor.sh \
  | bash -s -- hexacore.duckdns.org
exit   # y volver a entrar, para usar docker sin sudo
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

## 5. Primer despliegue

```bash
cd ~/HEXACORE/App/infra
./desplegar.sh --compilar --datos-demo   # compila en el servidor: no depende del CD
# o, cuando el CD ya haya publicado imágenes de main:
./desplegar.sh main --datos-demo
```

`--datos-demo` carga las cuentas de ejemplo (contraseña `hexacore2026`), solo si la base está
vacía. Abrir `https://hexacore.duckdns.org`; el primer acceso puede tardar unos segundos
mientras Caddy obtiene el certificado.

## 6. Despliegue automático en cada cambio a `main`

1. En tu computador, una llave solo para el CD:
   ```bash
   ssh-keygen -t ed25519 -f hexacore-cd -N "" -C "hexacore-cd"
   ssh-copy-id -i hexacore-cd.pub ubuntu@hexacore.duckdns.org
   ssh-keyscan hexacore.duckdns.org > hexacore-cd.known_hosts
   ```
2. En GitHub → el repositorio → Settings → Secrets and variables → Actions:

   | Tipo | Nombre | Valor |
   |---|---|---|
   | Secret | `PRODUCCION_SSH_CLAVE` | contenido de `hexacore-cd` (la privada) |
   | Secret | `PRODUCCION_SSH_HOST` | `hexacore.duckdns.org` |
   | Secret | `PRODUCCION_SSH_USUARIO` | `ubuntu` |
   | Secret | `PRODUCCION_SSH_KNOWN_HOSTS` | contenido de `hexacore-cd.known_hosts` |
   | Variable | `PRODUCCION_DOMINIO` | `hexacore.duckdns.org` |

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
