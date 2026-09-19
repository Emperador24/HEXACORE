# Servicio de Pedidos (CU-011–CU-015)
#
# Imagen para correr el servicio en contenedor con reinicio automático
# (RNF-04). Para desarrollar sigue siendo más cómodo `npm run start:dev`; ver
# App/infra/README.md.

# --- Compilación: necesita las dependencias de desarrollo (Nest CLI, TypeScript).
FROM node:22-alpine AS compilacion
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src ./src
RUN npm run build \
 && npm prune --omit=dev

# --- Ejecución: solo el código compilado y las dependencias de producción.
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=compilacion /app/package.json ./
COPY --from=compilacion /app/node_modules ./node_modules
COPY --from=compilacion /app/dist ./dist

# No corre como root.
USER node

ENV PUERTO=3003
EXPOSE 3003

# El orquestador (docker compose, Kubernetes) decide si la instancia recibe
# tráfico preguntando aquí. /salud responde 503 si falta PostgreSQL.
HEALTHCHECK --interval=5s --timeout=3s --start-period=20s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:'+process.env.PUERTO+'/api/v1/salud',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

# Las migraciones se aplican antes de arrancar. Si PostgreSQL aún no está, el
# comando falla, el contenedor sale y la política de reinicio lo vuelve a
# intentar: no hace falta ningún "esperar a que la base esté lista".
# Con varias réplicas, las migraciones deberían ir en un paso aparte del
# despliegue para que no las corran todas a la vez.
CMD ["sh", "-c", "node node_modules/typeorm/cli.js migration:run -d dist/persistencia/data-source.js && exec node dist/main.js"]
