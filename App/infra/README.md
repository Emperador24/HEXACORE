# Infra

Infraestructura de soporte compartida entre microservicios (SAD §8 y §11, vista física).

`docker-compose.yml` levanta el ambiente de **desarrollo local** que describe el SAD §11: una sola
instancia de cada pieza compartida, sin balanceo horizontal ni CDN — a diferencia de producción, que
usa un clúster de Kubernetes (ver la Figura "Diagrama de despliegue" en
`Documentation/Work/DescripcionArquitecturaSoftware.tex`).

Para desarrollar, los microservicios corren **fuera** de Docker (`npm run start:dev`) y se conectan
a estos puertos, para no perder la recarga en caliente.

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
| Pasarela de pagos simulada | `3099` | Sistema externo del CU-006 | — |
| Proveedor de correo simulado | `3098` | Sistema externo del CU-027; buzón legible en `/correos` | — |
| **API Gateway** (perfil `servicios`) | `8080` | Punto único de entrada al backend: autentica, enruta y balancea | ADR-02 |

Credenciales en los tres: `hexacore` / `hexacore`. Consola de RabbitMQ en <http://localhost:15672>.

**Redis va en el 6380, no en el 6379.** Es muy frecuente tener un Redis instalado con Homebrew
escuchando ya en 6379; con 6380 el compose arranca en cualquier máquina y además se elimina el
riesgo de que un servicio acabe hablando con el Redis equivocado sin darse cuenta.

## Los microservicios y el gateway en contenedor (perfil `servicios`)

Administración (`3002`), Entradas (`3001`) y el **API Gateway** (`8080`) también pueden correr aquí,
con **reinicio automático** si el proceso muere (RNF-04: medido en 1,0–1,3 s). No se levantan con el
`up -d` de siempre. Los dos servicios usan los mismos puertos que `npm run start:dev`, así que hay
que parar esos procesos antes:

```bash
docker compose -f App/infra/docker-compose.yml --profile servicios up -d --build
docker compose -f App/infra/docker-compose.yml --profile servicios stop administracion entradas-mercado-secundario
```

- Tras cambiar código, `--build` reconstruye la imagen.
- Aplican sus migraciones al arrancar. Si la base aún no responde, el contenedor sale y Docker lo
  reintenta hasta que la base vuelva.
- Usan las claves JWT de `claves-desarrollo/` montadas como archivos; la privada solo se monta en
  Administración.
- Docker Compose reinicia un proceso que muere, pero **no** uno colgado que sigue vivo. Eso queda
  para Kubernetes en producción. Ver `services/administracion/DECISIONES.md` §18.

### El API Gateway (ADR-02)

El `8080` es la **única dirección que conocen la app móvil y los portales**: el gateway autentica
cada petición y la enruta al microservicio que toca. Su configuración vive en `../gateway/`, que es
donde el SAD sitúa este contenedor; aquí solo se despliega. Ver `../gateway/README.md`.

Los puertos `3001` y `3002` siguen publicados porque las pruebas de cada servicio hablan directo con
él, pero **ningún cliente debería usarlos**. En producción no se publican.

Para verlo balancear entre varias instancias hace falta el override que quita los puertos fijos del
servicio que se escala (dos contenedores no pueden publicar el mismo puerto):

```bash
docker compose -f docker-compose.yml -f docker-compose.escalado.yml \
  --profile servicios up -d --scale entradas-mercado-secundario=2
python3 ../gateway/pruebas/gateway.py
```

## Una base de datos por microservicio

`initdb/01-bases.sql` crea las seis bases (una por dominio, ADR-01). Postgres ejecuta ese script
**solo la primera vez** que inicializa el volumen: si añades una base nueva después, créala a mano o
vuelve a levantar con `down -v`.

MongoDB (esquema documental de Reportes dentro de `administracion`, ADR-06) se añadirá cuando ese
dominio lo necesite; todavía no hay nada que guardar ahí.

## Pendiente

- **MongoDB** para Reportes/analítica.
- **Manifiestos de despliegue** para el ambiente de pruebas y producción (Kubernetes).
