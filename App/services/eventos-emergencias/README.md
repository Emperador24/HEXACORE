# Servicio de Eventos / Emergencias

SAD §9 (vista de componentes), CU-010, CU-016–CU-020, CU-026.

**Responsabilidad:** CRUD de eventos, localidades y aforo (CU-026); planificación logística,
asignación de personal operativo en campo, monitoreo del evento y gestión de incidentes
(CU-016–020); y gestión de evacuación ante emergencias (CU-010, caso complejo — segundo hilo
conductor del SAD, junto con CU-006).

**Componentes internos (SAD §9):** Controlador API, Servicio de Gestión de Eventos, Servicio de
Protocolo de Emergencia, Gestor de Zonas y Aforo (apoyado en Redis), Repositorio de Eventos,
Publicador de Eventos.

**ASR relacionados:** ASR-05 (actualización de aforo y zonas en tiempo real).

**Responsables:** Samuel Emperador (CU-010, CU-026), Diego Coronado (CU-016–020).

**Base de datos:** PostgreSQL (esquema propio, ADR-01).

## Estado

| Caso de uso | Estado |
|---|---|
| **CU-018 — Gestionar turno y asistencia del personal** | ✅ Implementado: turnos, solicitudes de cambio con búsqueda de reemplazo, registro de asistencia y propagación por cola |
| CU-016, CU-017, CU-019, CU-020 | Pendientes |
| CU-010 (evacuación), CU-026 (eventos) | Pendientes |

## Cómo levantarlo

```bash
cd ../../infra && ./iniciar.sh          # con todo el sistema
```

O suelto, contra la infraestructura compartida:

```bash
cp .env.example .env && npm install
npm run start:dev                        # puerto 3016
npm run seed                             # empleados y turno de ejemplo
```

**El `.env` debe apuntar a la infraestructura compartida** (`App/infra/docker-compose.yml`), no al
`docker-compose.yml` de esta carpeta: aquel levanta un RabbitMQ en los mismos puertos que el
compartido y los dos no pueden convivir. La base `eventos_emergencias` ya existe en el PostgreSQL
compartido.

**Los clientes no usan el 3016.** Entran por el **API Gateway** (ADR-02), que enruta
`/api/v1/logistica/...` hasta aquí.

## CU-018 — quién es quién

La pieza que conecta este servicio con el resto del sistema es `empleados.usuario_id`.

Las **cuentas** viven en el Servicio de Administración (CU-027): correo, contraseña y roles. Aquí
está la **ficha operativa** de quien trabaja en el evento —su área, su credencial, sus horas— ligada
a esa cuenta por su identificador. Es una referencia lógica, no una llave foránea: cada dominio
tiene su base (ADR-01).

De ahí salen tres reglas:

1. **Un empleado no se registra solo.** `POST /empleados` exige rol `Administrador`. Alguien con
   autoridad decide que esa persona trabaja en el evento, en qué área y con qué credencial.
2. **El área decide lo que se ve.** Al iniciar sesión, la app pregunta `GET /empleados/yo` y muestra
   únicamente las pantallas de esa área. Quien está en Parqueadero no ve la validación de entradas.
   Antes la app adivinaba el área por el correo, con un mapa escrito dentro de la app que se
   quedaba viejo en cuanto se daba de alta a alguien nuevo.
3. **Una cuenta de Personal sin ficha no entra.** No es un error del sistema: es alguien a quien
   todavía no han dado de alta, y se le dice eso mismo.

El área es **texto libre** a propósito: qué áreas existen depende del evento y del recinto. La app
reconoce `Entrada`, `Parqueadero`, `Restaurante` y `Jefe de personal`; a cualquier otra le muestra
las pantallas comunes del personal.

## Datos para probar

```bash
npm run seed      # 5 empleados de ejemplo, ligados a las cuentas de la semilla
npm run carga     # da ficha y turnos a las cuentas de Personal de la carga masiva
```

La carga reparte áreas con pesos realistas (la mitad en Entrada, un jefe cada
veinte personas) y asigna turnos vigentes, pasados y futuros — incluidos algunos
empleados **sin turno**, que es el caso de quien acaba de ser contratado.

Requiere haber corrido antes `cd ../administracion && npm run carga`: sin
cuentas no hay a quién dar de alta.

## Endpoints

Todos exigen sesión (RNF-06): token en `Authorization: Bearer`, verificado con la clave pública
(ADR-11) y contrastado con Redis por si la sesión se cerró.

| Método | Ruta | Quién |
|---|---|---|
| `POST` | `/empleados` | Administrador |
| `GET` | `/empleados` | Administrador, Organizador |
| `GET` | `/empleados/yo` | Cualquiera con sesión — su propia ficha y turno vigente |
| `POST` | `/turnos` | Con sesión |
| `GET` | `/turnos` | Con sesión |
| `POST` | `/turnos/:id/solicitudes-cambio` | Con sesión — el sistema busca reemplazo (mismo rol y zona, sin choque de horario) |
| `GET` | `/solicitudes-cambio` | Con sesión |
| `PATCH` | `/solicitudes-cambio/:id/revisar` | **Jefe de personal** o Administrador |
| `POST` | `/asistencia/entrada`, `/asistencia/salida` | Con sesión |
| `GET` | `/asistencia`, `/notificaciones` | Con sesión |

Quién aprueba un cambio de turno **sale del token**, no del cuerpo de la petición. Antes el cliente
mandaba un `supervisorId`, lo que permitía firmar una aprobación con el nombre de otro.

## Pruebas

```bash
npm run test:e2e     # 20 pruebas de integración, con PostgreSQL y RabbitMQ reales
npm test             # unitarias: todavía no hay (pasa en verde, no falla el CI)
```

Las e2e sustituyen el guard de sesión: son pruebas del **dominio** —horas máximas, búsqueda de
reemplazo, anomalías de asistencia—. La autenticación se comprueba de extremo a extremo contra el
sistema entero en `App/gateway/pruebas/gateway.py`.

## Pendiente

- **Reintentos y DLQ** en el consumidor de la cola: hoy confirma el mensaje siempre, así que un
  fallo al procesarlo lo pierde. El ADR-10 eligió RabbitMQ precisamente por traerlos de fábrica.
- **Reconexión del publicador**: si RabbitMQ no está arriba al iniciar, los eventos se descartan en
  silencio hasta reiniciar el servicio.
- **Migraciones** en vez de `DB_SYNCHRONIZE=true`, como en los otros dos servicios.
