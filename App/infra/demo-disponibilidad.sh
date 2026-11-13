#!/usr/bin/env bash
# Demostración en vivo de disponibilidad (RNF-03, RNF-04, RNF-10): Boletería
# replicada detrás del API Gateway.
#
#   ./demo-disponibilidad.sh             Boletería: los cuatro pasos, con pausa entre ellos
#   SERVICIO=nucleo ./demo-disponibilidad.sh
#                                        lo mismo con el Núcleo (2 réplicas)
#   ./demo-disponibilidad.sh --seguido   sin pausas
#   ./demo-disponibilidad.sh --restaurar vuelve a una réplica de cada uno, con sus puertos
#
# Con el sistema ya arriba (iniciar.sh). Los pasos:
#   1. Escala el servicio a REPLICAS (Boletería 3, Núcleo 2 por defecto).
#   2. Muestra con la cabecera X-Servidor que el gateway reparte entre ellas.
#   3. Mata el proceso de una réplica desde dentro (kill -9, una caída de verdad)
#      mientras llegan peticiones, y cuenta cuántas fallaron.
#   4. Espera a que Docker la reinicie sola y vuelva a recibir tráfico.
#
# El Núcleo se probó con 2 réplicas (la demo completa de CU pasa contra él):
# ver la sección "Disponibilidad" de DEMOSTRACION-ATRIBUTOS.md.
set -euo pipefail
cd "$(dirname "$0")"

SERVICIO=${SERVICIO:-boleteria}
case "$SERVICIO" in
  boleteria) REPLICAS=${REPLICAS:-3}; URL=${URL:-http://localhost:8080/api/v1/cartelera}; NOMBRE=Boletería ;;
  nucleo)    REPLICAS=${REPLICAS:-2}; URL=${URL:-http://localhost:8080/api/v1/salud};     NOMBRE=Núcleo ;;
  *) echo "SERVICIO debe ser boleteria o nucleo" >&2; exit 2 ;;
esac
PETICIONES=${PETICIONES:-30}
PAUSAR=1

# El monitoreo (si está levantado) es del mismo proyecto pero de otro archivo.
export COMPOSE_IGNORE_ORPHANS=True
compose() { docker compose -f docker-compose.yml -f docker-compose.escalado.yml --profile servicios "$@"; }
titulo() { printf '\n\033[1m== %s\033[0m\n' "$1"; }
pausa() { if [ "$PAUSAR" = 1 ]; then read -r -p "   (Enter para seguir) " _; fi; }
replicas() { compose ps -q "$SERVICIO"; }
sanas() { local n=0 c; for c in $(replicas); do [ "$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{end}}' "$c")" = healthy ] && n=$((n + 1)); done; echo "$n"; }

reparto() {
  local i
  for i in $(seq 1 "$PETICIONES"); do
    curl -s -o /dev/null -D - "$URL" | tr -d '\r' | awk -F': ' 'tolower($1)=="x-servidor"{print $2}'
  done | sort | uniq -c | awk '{printf "   %-22s %3d peticiones\n", $2, $1}'
}

case "${1:-}" in
  --seguido) PAUSAR=0 ;;
  --restaurar)
    docker compose -f docker-compose.yml --profile servicios up -d --no-deps --scale boleteria=1 --scale nucleo=1 boleteria nucleo
    echo "Boletería y Núcleo vuelven a una réplica, con los puertos 3001 y 3002 publicados."
    exit 0 ;;
  "") ;;
  *) sed -n '2,20p' "$0"; exit 2 ;;
esac

curl -sf -o /dev/null "$URL" || { echo "El gateway no responde en $URL. Arranca el sistema con ./iniciar.sh" >&2; exit 1; }

titulo "1. Escalar $NOMBRE a $REPLICAS réplicas"
compose up -d --no-deps --scale "$SERVICIO=$REPLICAS" "$SERVICIO" >/dev/null
inicio=$(date +%s)
until [ "$(sanas)" -ge "$REPLICAS" ]; do
  [ $(( $(date +%s) - inicio )) -gt 180 ] && { echo "   No quedaron $REPLICAS réplicas sanas en 3 minutos." >&2; exit 1; }
  sleep 2
done
echo "   $(sanas) réplicas sanas en $(( $(date +%s) - inicio )) s:"
for c in $(replicas); do
  printf '   %-34s %s\n' "$(docker inspect -f '{{.Name}}' "$c" | tr -d /)" \
    "$(docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' "$c")"
done
# El gateway resuelve el nombre `boleteria` cada 5 s (resolver valid=5s).
sleep 6
pausa

titulo "2. El gateway reparte: $PETICIONES peticiones a $URL"
reparto
pausa

victima=$(replicas | head -n 1)
nombre=$(docker inspect -f '{{.Name}}' "$victima" | tr -d /)
reinicios=$(docker inspect -f '{{.RestartCount}}' "$victima")
titulo "3. Se cae $nombre (kill -9 del proceso) con tráfico en curso"
salida=$(mktemp)
caida=$(date +%s)
docker exec "$victima" sh -c 'kill -9 $(pgrep -x node)' || true
# Peticiones seguidas durante 8 s desde el instante de la caída: código HTTP y
# réplica que atendió cada una.
fin=$(( caida + 8 ))
while [ "$(date +%s)" -lt "$fin" ]; do
  curl -s -o /dev/null -D - --max-time 5 -w 'codigo=%{http_code}\n' "$URL" | tr -d '\r' \
    | awk -F': ' 'tolower($1)=="x-servidor"{s=$2} /^codigo=/{split($0,c,"="); n=split(s,r,", "); if(n>1) s=r[1]"→"r[n]" (reintento)"; print c[2], (s==""?"-":s); s=""}'
done > "$salida"
total=$(wc -l < "$salida" | tr -d ' ')
fallidas=$(awk '$1!=200' "$salida" | wc -l | tr -d ' ')
echo "   En los 8 s siguientes a la caída: $total peticiones, $fallidas no respondieron 200."
echo "   Quién las atendió (un reintento es una petición que el gateway pasó a otra réplica sin que el cliente lo note):"
awk '{$1=""; sub(/^ /,""); print}' "$salida" | sort | uniq -c | awk '{n=$1; $1=""; sub(/^ /,""); printf "   %-50s %4d peticiones\n", $0, n}'
rm -f "$salida"
pausa

titulo "4. Docker la levanta de nuevo (restart: unless-stopped)"
until [ "$(docker inspect -f '{{.RestartCount}}' "$victima")" -gt "$reinicios" ] \
   && [ "$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{end}}' "$victima")" = healthy ]; do
  [ $(( $(date +%s) - caida )) -gt 180 ] && { echo "   No volvió en 3 minutos." >&2; exit 1; }
  sleep 1
done
echo "   $nombre reiniciada por Docker (reinicios: $(docker inspect -f '{{.RestartCount}}' "$victima")); sana de nuevo $(( $(date +%s) - caida )) s después de caer."
sleep 6
echo "   Vuelve a recibir tráfico:"
reparto

echo
echo "Para volver a una réplica: ./demo-disponibilidad.sh --restaurar"
