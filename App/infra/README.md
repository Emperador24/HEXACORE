# Infra

Infraestructura de soporte compartida entre microservicios (SAD §8 y §11, vista física).

`docker-compose.yml` levanta el ambiente de **desarrollo local** que describe el SAD §11: una sola
instancia de cada pieza compartida, sin balanceo horizontal ni CDN — a diferencia de producción, que
usa un clúster de Kubernetes (ver la Figura "Diagrama de despliegue" en
`Documentation/Work/DescripcionArquitecturaSoftware.tex`).

Los microservicios corren **fuera** de Docker (`npm run start:dev`) y se conectan a estos puertos,
para no perder la recarga en caliente durante el desarrollo.

```bash
docker compose -f App/infra/docker-compose.yml up -d      # levantar
docker compose -f App/infra/docker-compose.yml ps         # estado
docker compose -f App/infra/docker-compose.yml down       # parar, conservando datos
docker compose -f App/infra/docker-compose.yml down -v    # parar y borrar datos
```

## Qué levanta

| Pieza | Puerto en el host | Para qué | ADR |
|---|---|---|---|
| **PostgreSQL** 16 | `5432` | Esquemas transaccionales de todos los dominios | ADR-01, ADR-06 |
| **Redis** 7 | `6380` | Bloqueo distribuido del checkout de reventa y datos de acceso rápido | ADR-03 |
| **RabbitMQ** 3.13 | `5672` · consola `15672` | Cola de tareas: notificaciones, liquidación, auditoría, alertas | ADR-10 |

Credenciales en los tres: `hexacore` / `hexacore`. Consola de RabbitMQ en <http://localhost:15672>.

**Redis va en el 6380, no en el 6379.** Es muy frecuente tener un Redis instalado con Homebrew
escuchando ya en 6379; con 6380 el compose arranca en cualquier máquina y además se elimina el
riesgo de que un servicio acabe hablando con el Redis equivocado sin darse cuenta.

## Una base de datos por microservicio

`initdb/01-bases.sql` crea las seis bases (una por dominio, ADR-01). Postgres ejecuta ese script
**solo la primera vez** que inicializa el volumen: si añades una base nueva después, créala a mano o
vuelve a levantar con `down -v`.

MongoDB (esquema documental de Reportes dentro de `administracion`, ADR-06) se añadirá cuando ese
dominio lo necesite; todavía no hay nada que guardar ahí.

## Pendiente

- **MongoDB** para Reportes/analítica.
- **Simulador de la Pasarela de Pagos** — actor externo del CU-006; se añade en el paso 6 de
  `services/entradas-mercado-secundario`.
- **Manifiestos de despliegue** para el ambiente de pruebas y producción (Kubernetes).
