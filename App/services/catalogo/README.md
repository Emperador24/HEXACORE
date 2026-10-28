# Microservicio de Catálogo

Cartelera pública de eventos: **CU-005 (Consultar evento)**.

Salió de `entradas-mercado-secundario` en la **fase A** de la migración a ADR-14
(ver `Documentation/Work/MIGRACION-ADR-14.md`).

## Por qué es un microservicio

Cumple tres de los cuatro criterios de extracción de ADR-14:

1. **Pico de carga propio.** En la apertura de venta de un evento muy demandado,
   la mayor parte del tráfico es de *consulta*, no de compra. Con ambas cosas en
   el mismo proceso, las dos se degradan.
3. **Su estado cabe en un almacén propio.** Es una proyección de sólo lectura;
   en la fase D pasa a un índice de búsqueda y deja de usar PostgreSQL.
4. **Su falla queda aislada.** Que la cartelera no responda no puede impedir una
   compra ya en curso, ni al revés.

## Qué datos tiene

Dos tablas, las dos **proyección de sólo lectura** de eventos que pertenecen a
*Eventos y recintos*:

- `eventos_referencia` — nombre, fecha, lugar, ciudad, categoría, artista, estado.
- `localidades_evento` — precio, aforo, vendidas, reservadas.

Nada de este servicio las escribe en caliente. Hoy las puebla `npm run semilla`;
cuando exista Eventos y recintos las mantendrá al día el evento `EventoPublicado`
del broker.

**La misma proyección vive también en `entradas-mercado-secundario`**, con sus
propias columnas (`permite_reventa`, `aforo_maximo`, `asistentes`) que aquí no
están porque la cartelera no las lee. Las dos copias se siembran con los mismos
ids a propósito; hasta que el broker las sincronice, hay que sembrar las dos.

## Arrancar

```bash
cp .env.example .env
npm install
npm run migracion:correr
npm run semilla
npm run start:dev          # http://localhost:3004/api/v1/cartelera
```

La documentación OpenAPI queda en `/api/v1/docs` fuera de producción.
