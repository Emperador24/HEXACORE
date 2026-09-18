# Servicio de Eventos / Emergencias

Backend real de **CU-018 — Gestionar turno y asistencia del personal** (NestJS +
TypeORM + PostgreSQL), con cola de mensajes RabbitMQ y soporte offline-first.
Ver `README.SAD.md` para la responsabilidad completa del servicio según el SAD.

## Requisito: infraestructura compartida

Este servicio **no** levanta su propio Postgres/RabbitMQ — usa la instancia
única compartida por todo el equipo. Levántala primero:

```bash
docker compose -f ../../infra/docker-compose.yml up -d
```

Ver `App/infra/README.md` para el detalle (puertos, credenciales, qué crea
`initdb/01-bases.sql`).

## Correr en desarrollo

```bash
npm install
cp .env.example .env   # los valores por defecto ya apuntan a la infra compartida
npm run start:dev
npm run seed            # crea empleados y un turno demo (idempotente)
```

API en `http://localhost:3016`, documentación interactiva en
`http://localhost:3016/docs`.

## Correr dockerizado (además de la infra compartida de arriba)

```bash
docker compose up -d --build
```

## Pruebas

```bash
npm run test:e2e            # 22 pruebas de integración contra Postgres/RabbitMQ reales
npm run test:e2e -- --coverage
```
