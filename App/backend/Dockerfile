FROM node:22.22.3-alpine AS compilacion
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY apps ./apps
COPY modulos ./modulos
COPY compartido ./compartido
RUN npm run build && npm prune --omit=dev --no-audit --no-fund

FROM node:22.22.3-alpine
WORKDIR /app
ENV NODE_ENV=production PUERTO=3002
COPY --from=compilacion /app/package.json ./
COPY --from=compilacion /app/node_modules ./node_modules
COPY --from=compilacion /app/dist ./dist
USER node
EXPOSE 3002
HEALTHCHECK --interval=5s --timeout=3s --start-period=20s --retries=10 \
  CMD node -e "require('http').get('http://127.0.0.1:'+process.env.PUERTO+'/api/v1/salud',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"
# Transición: conserva las dos bases/historiales. Con réplicas las migraciones
# deben ejecutarse como tarea de despliegue única antes de levantar instancias.
CMD ["sh", "-c", "node node_modules/typeorm/cli.js migration:run -d dist/modulos/identidad/persistencia/data-source.js && node node_modules/typeorm/cli.js migration:run -d dist/modulos/alimentos/persistencia/data-source.js && exec node dist/apps/nucleo/main.js"]
