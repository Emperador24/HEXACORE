# Sin dependencias: basta con copiar el único archivo del servidor.
FROM node:22-alpine

WORKDIR /app
COPY server.js ./

# No corre como root: si el simulador tuviera un fallo, que no sea con todos
# los permisos del contenedor.
USER node

ENV PUERTO=3099
EXPOSE 3099

CMD ["node", "server.js"]
