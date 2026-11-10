#!/usr/bin/env bash
#
# Prepara un servidor Ubuntu nuevo para HEXACORE. Se ejecuta UNA vez, en el
# servidor, con un usuario que tenga sudo:
#
#   curl -fsSL https://raw.githubusercontent.com/Emperador24/HEXACORE/main/App/infra/preparar-servidor.sh \
#     | bash -s -- hexacore.duckdns.org
#
# o, con el repositorio ya clonado:  ./App/infra/preparar-servidor.sh hexacore.duckdns.org
#
# Hace: instala Docker, clona el repositorio en ~/HEXACORE, crea memoria swap
# (una VM de 4 GB lo agradece), abre solo los puertos 22, 80 y 443, genera
# claves JWT propias y deja App/infra/.env con el dominio. No despliega: eso
# lo hace desplegar.sh (o el CD). Ver DESPLIEGUE.md.
#
# Se puede volver a ejecutar: lo que ya está hecho no se repite ni se pisa.

set -euo pipefail

DOMINIO="${1:-}"
[[ -n "$DOMINIO" ]] || { echo "Uso: preparar-servidor.sh <dominio>   (p. ej. hexacore.duckdns.org)"; exit 1; }
REPOSITORIO="${HEXACORE_REPOSITORIO:-https://github.com/Emperador24/HEXACORE.git}"
DESTINO="${HEXACORE_DESTINO:-$HOME/HEXACORE}"

paso() { printf '\n\033[1m%s\033[0m\n' "$*"; }

paso "Docker"
if ! command -v docker >/dev/null; then
  curl -fsSL https://get.docker.com | sudo sh
fi
sudo usermod -aG docker "$USER"

paso "Memoria swap (2 GB)"
if ! swapon --show | grep -q /swapfile; then
  sudo fallocate -l 2G /swapfile
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile >/dev/null
  sudo swapon /swapfile
  echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null
fi

paso "Cortafuegos: solo SSH, HTTP y HTTPS"
if [[ -f /etc/iptables/rules.v4 ]] && grep -q -- '-j REJECT' /etc/iptables/rules.v4; then
  # Imágenes de Ubuntu de Oracle Cloud: traen iptables que rechaza todo salvo
  # SSH, y no se llevan bien con ufw. Se abren 80 y 443 antes de ese REJECT y
  # se guardan para que sobrevivan al reinicio. (Además hay que abrirlos en la
  # Security List de la VCN, en la consola de Oracle: ver DESPLIEGUE.md.)
  for regla in "-p tcp --dport 80" "-p tcp --dport 443" "-p udp --dport 443"; do
    # shellcheck disable=SC2086
    sudo iptables -C INPUT $regla -j ACCEPT 2>/dev/null || sudo iptables -I INPUT 1 $regla -j ACCEPT
  done
  sudo netfilter-persistent save >/dev/null
elif command -v ufw >/dev/null; then
  sudo ufw allow OpenSSH >/dev/null
  sudo ufw allow 80/tcp >/dev/null
  sudo ufw allow 443 >/dev/null
  sudo ufw --force enable >/dev/null
fi

paso "Repositorio en $DESTINO"
[[ -d "$DESTINO/.git" ]] || git clone "$REPOSITORIO" "$DESTINO"
cd "$DESTINO/App/infra"

paso "Claves JWT propias del servidor"
# Las de claves-desarrollo/ son públicas (están en git): en producción con
# ellas cualquiera podría firmarse una sesión de administrador.
mkdir -p claves-produccion
if [[ ! -f claves-produccion/jwt-privada.pem ]]; then
  openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out claves-produccion/jwt-privada.pem 2>/dev/null
  openssl pkey -in claves-produccion/jwt-privada.pem -pubout -out claves-produccion/jwt-publica.pem
  # Los contenedores corren como el usuario `node` (uid 1000) y tienen que leerla.
  chmod 644 claves-produccion/jwt-privada.pem claves-produccion/jwt-publica.pem
fi

paso "Configuración (App/infra/.env)"
if [[ ! -f .env ]]; then
  {
    echo "# Producción de HEXACORE. No se sube a git. Ver .env.ejemplo y DESPLIEGUE.md."
    echo "COMPOSE_PROJECT_NAME=hexacore"
    echo "DOMINIO=$DOMINIO"
    echo "TOKEN_SERVICIOS=$(openssl rand -hex 32)"
    echo
    sed -n '/^# --- Correo/,$p' .env.ejemplo
  } > .env
  chmod 600 .env
fi

paso "Listo"
cat <<FIN
  1. Cierra la sesión SSH y vuelve a entrar (para usar docker sin sudo).
  2. Si quieres correo real o Stripe, edita $DESTINO/App/infra/.env.
  3. Primer despliegue:
       cd $DESTINO/App/infra && ./desplegar.sh main --datos-demo
     (o ./desplegar.sh --compilar --datos-demo si el CD aún no publicó imágenes)
  4. Para que cada cambio en main se despliegue solo, configura los secretos
     del repositorio que explica DESPLIEGUE.md.
FIN
