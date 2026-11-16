#!/bin/sh
# BusyBox ya está en las imágenes Alpine. Un GET, sin arrancar V8 ni reintentar.
# Conservar el criterio HTTP 200: tampoco aceptar un 201 o una redirección a 200.
set -eu
respuesta=$(wget -T 5 -S -O /dev/null "http://127.0.0.1:${PUERTO}/api/v1/salud" 2>&1) || exit 1
codigo=$(printf '%s\n' "$respuesta" | awk '$1 ~ /^HTTP\/[0-9.]+$/ && $2 >= 200 { print $2; exit }')
test "$codigo" = 200
