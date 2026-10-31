# Imagen del API Gateway (ADR-02, ADR-15).
#
# En desarrollo el `docker-compose.yml` monta estos archivos desde el disco, que
# es cómodo para editarlos sin reconstruir nada. Para desplegar no sirve: lo que
# se despliega tiene que ser una cosa sola, con su configuración dentro, que se
# pueda etiquetar y que llegue idéntica a cualquier máquina.
#
# Por eso esta imagen **lleva la configuración adentro**. Es la que publica el
# pipeline de entrega continua.
#
# Lo que NO lleva es la clave pública del JWT: se monta en
# `/etc/nginx/claves/jwt-publica.pem` al desplegar, igual que en los servicios.
# Así la misma imagen sirve en cualquier entorno y la de desarrollo no viaja a
# producción por descuido.

FROM nginx:1.27-alpine

COPY nginx-principal.conf /etc/nginx/nginx.conf
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY autenticar.conf /etc/nginx/hexacore/autenticar.conf
COPY autenticacion.js /etc/nginx/njs/autenticacion.js

# Falla el build si la configuración tiene un error de sintaxis, en vez de
# publicar una imagen que no arranca. Nginx no resuelve aquí los nombres de los
# servicios —no existen todavía— pero sí valida la sintaxis y carga el njs, que
# es lo que se rompe al editar a mano.
RUN nginx -t

EXPOSE 8080

HEALTHCHECK --interval=10s --timeout=3s --retries=5 \
  CMD wget -qO- http://127.0.0.1:8080/salud || exit 1
