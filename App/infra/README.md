# Infra

Infraestructura de soporte compartida entre microservicios (SAD §8 y §11, vista física).

`docker-compose.yml` levanta el ambiente de **desarrollo local** que describe el SAD §11: una sola
instancia de cada pieza compartida, sin balanceo horizontal ni CDN — a diferencia de producción, que
usa un clúster de Kubernetes (ver la Figura "Diagrama de despliegue" en
`Documentation/Work/DescripcionArquitecturaSoftware.tex`).

Para desarrollar, los microservicios corren **fuera** de Docker (`npm run start:dev`) y se conectan
a estos puertos, para no perder la recarga en caliente.

## Arrancar todo con una sola orden

```bash
cd App/infra
./iniciar.sh                       # sistema completo en este computador
./iniciar.sh --replicas 2          # con 2 instancias del Servicio de Entradas
./iniciar.sh --parar               # bajarlo, conservando los datos
```

Levanta la capa de datos, los microservicios y el API Gateway, espera a que
respondan, siembra los datos de ejemplo e imprime las direcciones y las cuentas.
Desde cero tarda alrededor de **1 min 20 s**.

### Repartido en dos computadores

Es el requisito de desplegabilidad. En el computador **A** (capa de datos):

```bash
./iniciar.sh --rol datos           # imprime su IP al terminar
```

En el computador **B** (microservicios y gateway):

```bash
./iniciar.sh --rol servicios --datos 192.168.1.20
```

Las variables `HOST_POSTGRES`, `HOST_REDIS`, `HOST_RABBIT`, `HOST_CORREO` y
`HOST_PASARELA` del compose son las que permiten esto; el script las exporta y
añade `docker-compose.remoto.yml`, que quita las dependencias locales para que
Docker no levante una base de datos en la máquina equivocada.

Las interfaces se arrancan aparte, apuntando al gateway del computador B
(`npm start` en el portal, `flutter run --dart-define=HEXACORE_HOST=<IP de B>`).

## Qué levanta `./iniciar.sh`

Diez contenedores: PostgreSQL, Redis, RabbitMQ, los dos sistemas externos
simulados (correo y pasarela), los tres microservicios, el API Gateway y el
**Portal Web de Clientes** en el `4200`.

Lo único que no levanta —ni puede— es la **app móvil**: se instala en un
teléfono o un simulador, no se arranca desde un script.

### Datos de ejemplo sin necesitar Node

Las semillas corren con `ts-node` desde el código fuente. En una máquina que
solo tiene Docker eso no está, y el sistema arrancaba **vacío**: sin cuentas, o
sea sin poder entrar.

Por eso los datos de ejemplo están también congelados en SQL, en `datos-demo/`:

```bash
./iniciar.sh                     # con Node: usa las semillas
./iniciar.sh --datos-demo sql    # sin Node: carga los volcados
```

Por defecto el script lo decide solo: si encuentra Node y las dependencias
instaladas usa las semillas, que son la fuente de verdad; si no, los volcados.

Cuando cambien las semillas o el esquema hay que regenerarlos:

```bash
./exportar-datos-demo.sh
```

## Desplegar desde las imágenes publicadas (entrega continua)

Cada vez que algo entra a `develop` o `main`, el pipeline de CD construye las
imágenes de los tres microservicios y del gateway y las publica en
`ghcr.io/emperador24`. Para levantar el sistema desde ahí, sin compilar nada:

```bash
./iniciar.sh --registro develop      # la última de develop
./iniciar.sh --registro main         # la última de main
./iniciar.sh --registro sha-a1b2c3d  # un commit exacto, para volver atrás
```

En un computador que solo va a *usar* el sistema —el de la demostración, el de
un compañero— esto es la diferencia entre segundos y varios minutos de
compilación. Y como cada commit deja su imagen etiquetada, volver a una versión
anterior es cambiar la etiqueta.

La imagen del gateway **lleva el `nginx.conf` dentro**: lo que se despliega es
una cosa sola. En desarrollo se sigue montando el archivo desde el disco para
poder editarlo sin reconstruir.

Los dos simuladores (correo y pasarela) siguen compilándose en la máquina: son
sistemas externos en el SAD, no producto, y son veinte líneas de Node.

## Órdenes de Docker Compose directas

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
