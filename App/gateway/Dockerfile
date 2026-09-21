# Imagen del API Gateway (ADR-02).
#
# En desarrollo el `docker-compose.yml` monta `nginx.conf` desde el disco, que
# es cómodo para editarlo sin reconstruir nada. Para desplegar no sirve: lo que
# se despliega tiene que ser una cosa sola, con su configuración dentro, que se
# pueda etiquetar y que llegue idéntica a cualquier máquina.
#
# Por eso esta imagen **lleva la configuración adentro**. Es la que publica el
# pipeline de entrega continua.

FROM nginx:1.27-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf

# Falla el build si la configuración tiene un error de sintaxis, en vez de
# publicar una imagen que no arranca. Nginx no resuelve aquí los nombres de los
# servicios —no existen todavía— pero sí valida la sintaxis, que es lo que se
# rompe al editar a mano.
RUN nginx -t

EXPOSE 8080

HEALTHCHECK --interval=10s --timeout=3s --retries=5 \
  CMD wget -qO- http://127.0.0.1:8080/salud || exit 1
