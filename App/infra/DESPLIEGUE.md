# Despliegue en producción

**Servidor de presentación en marcha desde el 16/11/2026** (Samuel):

| | |
|---|---|
| Portal de clientes y API | https://hexacore-javeriana.duckdns.org (`/api/v1`) |
| Portal administrativo | https://admin.hexacore-javeriana.duckdns.org |
| Máquina | Google Cloud Compute Engine, `e2-standard-2` (2 vCPU, 8 GB), Ubuntu 24.04, `us-central1`, IP estática `35.255.61.156` |
| Certificados | Let's Encrypt, los pide y renueva Caddy |
| Despliegue continuo | Configurado: cada merge a `main` se despliega solo (sección 5) |

El nombre `hexacore.duckdns.org` que usaba antes esta guía **pertenece a un tercero**: él y
sus subdominios quedan excluidos de pruebas, SSH, HTTPS y escaneos. El del equipo es
`hexacore-javeriana.duckdns.org`.

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

En el servidor solo Caddy publica puertos (80 y 443). PostgreSQL, Redis, RabbitMQ y los
servicios quedan dentro de la red de Docker. Cada portal sirve también `/api` en su propio
dominio, así no hace falta CORS y la cookie de sesión funciona igual que en local. Detalle en
[docker-compose.produccion.yml](docker-compose.produccion.yml) y [produccion/Caddyfile](produccion/Caddyfile).

Los pasos siguientes son los que se siguieron. Sirven igual para montar otro servidor: basta
una máquina Ubuntu con 4 GB de RAM o más, en cualquier proveedor.

## 1. Máquina virtual (Google Cloud)

Con la prueba gratuita de Google Cloud (US$300 por 90 días; pide tarjeta pero no cobra sin
pasar la cuenta a pago). *Compute Engine → Instancias de VM → Crear instancia*:

- **Región:** `us-central1`. **Tipo:** E2 → `e2-standard-2` (2 vCPU, 8 GB). Con `e2-medium`
  (4 GB) también arranca, pero justo. Aprovisionamiento **Estándar**, no Spot.
- **SO y almacenamiento:** Ubuntu 24.04 LTS **x86/64**, disco persistente balanceado de **50 GB**
  (los 10 GB por defecto no alcanzan para las imágenes).
- **Herramientas de redes:** marcar *Permitir tráfico HTTP* y *Permitir tráfico HTTPS*. En
  *nic0 → Dirección IPv4 externa*, **Reservar dirección IP externa estática**, para que no
  cambie al reiniciar.
- **Seguridad → Administrar acceso → Agregar elemento:** la llave pública seguida del usuario,
  `ssh-ed25519 AAAA… ubuntu`. Sin el usuario al final, Google la rechaza.

Antes de conectarse la primera vez, comparar la huella SSH con la de *Registros → Puerto
serie 1* de la instancia (`ED25519`), en vez de aceptar la que diga el servidor.

Se intentó primero Oracle Cloud *Always Free* (Bogotá): no había capacidad para máquinas ARM
y la consola bloqueó más intentos. Azure for Students no estaba activado en la cuenta.

## 2. Dominio (DuckDNS)

En https://www.duckdns.org, con la cuenta de GitHub: crear el subdominio y **escribir a mano**
la IP de la máquina (DuckDNS propone la del computador desde el que se entra). DuckDNS
resuelve también los subdominios del tuyo, así que `admin.<sub>.duckdns.org` funciona sin
hacer nada. Con un dominio propio basta con dos registros A (`@` y `admin`) hacia la IP; si el
administrativo va en otro nombre, se pone en `DOMINIO_ADMIN` en el `.env`.

## 3. Preparar el servidor (una vez)

```bash
ssh ubuntu@hexacore-javeriana.duckdns.org
curl -fsSL https://raw.githubusercontent.com/Emperador24/HEXACORE/main/App/infra/preparar-servidor.sh \
  | bash -s -- hexacore-javeriana.duckdns.org
exit   # y volver a entrar, para usar docker sin sudo
```

[preparar-servidor.sh](preparar-servidor.sh) instala Docker, crea memoria swap, deja abiertos
solo los puertos 22, 80 y 443 (con `ufw`; en Oracle, con sus reglas de `iptables`) y clona el
repositorio en `~/HEXACORE`. También **genera claves JWT propias** en
`App/infra/claves-produccion/` y escribe `App/infra/.env` con el dominio. Las claves de
`claves-desarrollo/` están en git: con ellas cualquiera podría firmarse una sesión de
administrador, y en producción el gateway las rechaza.

## 4. Primer despliegue

```bash
cd ~/HEXACORE/App/infra
./desplegar.sh main --datos-demo          # imágenes que publicó el CD
# o ./desplegar.sh --compilar --datos-demo si el CD aún no las publicó
```

`--datos-demo` carga las cuentas de ejemplo (contraseña `hexacore2026`), solo si la base está
vacía. El primer acceso a `https://hexacore-javeriana.duckdns.org` puede tardar unos segundos
mientras Caddy obtiene el certificado.

Las imágenes `hexacore-*` de ghcr.io son públicas, así que el servidor las baja sin token. Si
alguna vez quedan privadas, agregar en el `.env` del servidor `GHCR_USUARIO` y `GHCR_TOKEN`
(token clásico con `read:packages`).

## 5. Despliegue automático en cada cambio a `main`

1. Una llave **solo para el CD**, autorizada en el servidor, y la huella del servidor ya
   verificada (la del paso 1), escrita con el nombre que usará Actions:
   ```bash
   ssh-keygen -t ed25519 -f hexacore-cd -N "" -C "hexacore-cd"
   ssh-copy-id -i hexacore-cd.pub ubuntu@hexacore-javeriana.duckdns.org
   # known_hosts: "hexacore-javeriana.duckdns.org ssh-ed25519 AAAA…" con la huella comprobada
   ```
2. En GitHub → Settings → Secrets and variables → Actions (o con `gh secret set`, que lee la
   llave del archivo sin mostrarla):

   | Tipo | Nombre | Valor |
   |---|---|---|
   | Secret | `PRODUCCION_SSH_CLAVE` | contenido de `hexacore-cd` (la privada) |
   | Secret | `PRODUCCION_SSH_HOST` | `hexacore-javeriana.duckdns.org` |
   | Secret | `PRODUCCION_SSH_USUARIO` | `ubuntu` |
   | Secret | `PRODUCCION_SSH_KNOWN_HOSTS` | la línea de `known_hosts` del paso anterior |
   | Variable | `PRODUCCION_DOMINIO` | `hexacore-javeriana.duckdns.org` |

   Los cinco quedaron configurados el 16/11. Sin `PRODUCCION_DOMINIO`, el trabajo de
   despliegue no corre (no falla).
3. Desde ahí, cada merge a `main` pasa por el CD. El trabajo **Desplegar en producción** entra
   por SSH, pone el repositorio en ese commit, despliega `sha-<commit>` y comprueba que
   `https://<dominio>/api/v1/salud` responda.

## 6. Correo y pagos reales (opcional)

Editar `~/HEXACORE/App/infra/.env` en el servidor y descomentar el bloque de Gmail y el de Stripe
([.env.ejemplo](.env.ejemplo) explica cada variable). Los enlaces de los correos ya apuntan a
`https://<dominio>/cuenta`.

Para Stripe, el webhook va directo al servidor, sin la Stripe CLI. En el panel de Stripe →
Developers → Webhooks se agrega el endpoint `https://<dominio>/api/v1/pagos/webhook/stripe` con
los eventos `payment_intent.succeeded`, `payment_intent.payment_failed` y `refund.updated`. El
`whsec_…` que muestra Stripe se copia en `STRIPE_SECRETO_WEBHOOK`.

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

La máquina gasta unos US$54 al mes del crédito de prueba: al terminar la entrega, detenerla o
borrarla en la consola de Google Cloud.

## Escaneo OWASP del servidor

El CD conecta `owasp-desplegado.yml` después de `despliegue`, incluida la verificación de las
ocho aplicaciones activas por SHA OCI (`verificar-version.py`). Gateway/Caddy exponen
`/version`, revisado antes y después del ZAP pasivo. No basta con `.version-desplegada` ni con
la etiqueta solicitada.

El perfil autenticado usa los secretos `OWASP_CLIENTE_EMAIL` / `OWASP_CLIENTE_CONTRASENA`
de una cuenta exclusiva de ensayo, creada el 17/11 (opcional: `PRODUCCION_DOMINIO_ADMIN`). Tras verificar la revisión se hace un único login HTTPS, sin
seguir redirecciones, para obtener JWT nuevo al terminar el CD; no se amplía su TTL. El
certificado de Let's Encrypt es confiable para el runner, sin excepciones TLS.

**Resultado contra el servidor (17/11):** [CD de `main`](https://github.com/Emperador24/HEXACORE/actions/runs/44044715233), revisión `86d8902` igual antes y
después; ZAP 2.17.0 con **0 High**, 10 Medium (CSP con estilos en línea, fuentes sin SRI),
19 Low (HSTS) y 12 Informational. [HTML/JSON saneados](https://github.com/Emperador24/HEXACORE/actions/runs/44044715233/artifacts/14311052588).

La evidencia anterior es el **despliegue temporal de CI111**, dentro de un runner
de Actions: [ejecución](https://github.com/Emperador24/HEXACORE/actions/runs/44000569216)
y [HTML/JSON saneados](https://github.com/Emperador24/HEXACORE/actions/runs/44000569216/artifacts/14291638302).
Reportes `owasp-presentacion`: todas las instancias saneadas en HTML/JSON, criterio cero High;
ZAP no tiene Critical. El reporte `atributos-sebastian` de CI identifica `ci-efimero` y
corresponde a otro entorno. [Guion y límites](../../Documentation/Work/PLAN-CIERRE-SEBASTIAN.md).
