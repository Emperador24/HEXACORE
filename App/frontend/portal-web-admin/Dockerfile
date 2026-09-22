# Imagen del Portal Web Administrativo/Operativo.
#
# Dos etapas: Angular compila con Node, y lo que se despliega es solo el
# resultado servido por Nginx. La imagen final no lleva ni Node ni las
# dependencias — son unos pocos megas de HTML, CSS y JavaScript.
#
# **No hace falta recompilar por máquina.** El portal averigua la dirección del
# backend en el navegador, a partir del host desde el que se sirvió la página
# (`window.location.hostname` en `core/servidor.ts`), así que la misma imagen
# sirve en `localhost` y en el computador de al lado.
#
# El puerto es el 4201 y no el 4200 del portal de clientes: los dos se levantan
# a la vez en la misma máquina, y el gateway ya acepta ambos como origen de
# CORS (`nginx.conf`, mapa `$origen_permitido`).

FROM node:22-alpine AS compilacion
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:1.27-alpine

# Angular genera el sitio en `browser/`; lo de al lado es para renderizado en
# servidor, que aquí no se usa.
COPY --from=compilacion /app/dist/portal-web-admin/browser /usr/share/nginx/html

# Una aplicación de una sola página necesita que **cualquier** ruta devuelva el
# index: `/admin/cuentas` no es un archivo en disco, es una ruta que resuelve el
# enrutador de Angular. Sin esto, recargar dentro del portal da 404.
RUN printf 'server {\n\
  listen 4201;\n\
  root /usr/share/nginx/html;\n\
  index index.html;\n\
  location / {\n\
    try_files $uri $uri/ /index.html;\n\
  }\n\
}\n' > /etc/nginx/conf.d/default.conf

EXPOSE 4201

HEALTHCHECK --interval=10s --timeout=3s --retries=5 \
  CMD wget -qO- http://127.0.0.1:4201/ >/dev/null || exit 1
