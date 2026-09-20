# Imagen del servicio eventos-emergencias (CU-018), lista para desplegarse
# en cualquier computador junto a Postgres y RabbitMQ vía docker-compose —
# soporte del requisito de "desplegabilidad en 2+ computadoras".

FROM node:22-alpine AS builder
RUN npm install -g npm@11
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json tsconfig.build.json nest-cli.json ./
COPY src ./src
RUN npm run build

FROM node:22-alpine AS runtime
RUN npm install -g npm@11
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist
EXPOSE 3016
CMD ["node", "dist/main.js"]
