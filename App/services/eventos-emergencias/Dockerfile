# Imagen del Servicio de Eventos / Emergencias (CU-018 y siguientes).
#
# Dos etapas: la primera compila con las dependencias de desarrollo, la segunda
# se queda solo con lo necesario para correr. Así la imagen final no lleva ni el
# compilador de TypeScript ni las pruebas.

FROM node:22-alpine AS compilacion
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src ./src
RUN npm run build \
 && npm prune --omit=dev

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=compilacion /app/package.json ./
COPY --from=compilacion /app/node_modules ./node_modules
COPY --from=compilacion /app/dist ./dist
USER node
ENV PUERTO=3016
EXPOSE 3016

# La sonda usa la ruta pública de turnos: comprobar que el proceso responde no
# basta si la base no contesta, y esta consulta sí la toca.
HEALTHCHECK --interval=5s --timeout=3s --start-period=25s --retries=3 \
  CMD node -e "require('http').get('http://127.0.0.1:'+(process.env.PORT||3016)+'/api/v1/turnos',r=>process.exit(r.statusCode<500?0:1)).on('error',()=>process.exit(1))"

CMD ["node", "dist/main.js"]
