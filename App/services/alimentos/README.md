# Servicio de dominio de Alimentos

Pedidos de alimentos y bebidas dentro del recinto: **CU-011 a CU-015**.

Salió del Núcleo en la **fase A** de la migración a ADR-14
(ver `Documentation/Work/MIGRACION-ADR-14.md`).

## Por qué es servicio de dominio y NO microservicio

Es la otra mitad de ADR-14, y conviene decirla: **no cumple dos de los cuatro
criterios de extracción**. Su carga es estable —la gente pide comida durante
todo el evento, no en una apertura de venta— y ningún otro dominio lo usa.

Por eso corre con **dos réplicas fijas**, por disponibilidad y no por
elasticidad, y comparte la base central con los demás servicios de dominio en
lugar de tener autoescalado.

Que esté aparte del Núcleo no es por carga: es porque ADR-14 vuelve a separar
los dominios, y Autenticación sí es un microservicio que no tenía por qué
arrastrar a Alimentos en cada despliegue.

## Lo que cambió al salir

- **Una sola conexión, la por defecto.** Las conexiones nombradas de ADR-12
  existían para que dos bases no colisionaran en un proceso compartido. Aquí
  hay una sola base y ese mecanismo sobra.
- **Solo la clave pública.** Verifica tokens pero no los firma: si este
  servicio se viera comprometido, no podría fabricar uno (ADR-11). La privada
  se quedó en Autenticación.

## Arrancar

```bash
cp .env.example .env
npm install
npm run migracion:correr
npm run semilla
npm run start:dev          # http://localhost:3007/api/v1/salud
```

Necesita PostgreSQL, Redis, el broker y el simulador de pasarela:
`cd App/infra && ./iniciar.sh --rol datos`.
