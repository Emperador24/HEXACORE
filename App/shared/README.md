# Shared

Contratos y tipos compartidos entre servicios y frontends, si se necesitan (p. ej. esquemas de los
eventos publicados en la cola de mensajes — `ENTRADA_TRANSFERIDA` y similares — o DTOs comunes de
autenticación validados por el API Gateway).

Cada microservicio mantiene su propio modelo de datos (ADR-01); esta carpeta es solo para lo que
varios componentes necesiten acordar explícitamente, no para lógica de negocio compartida.

Como el frontend web (Angular/TypeScript) y el móvil (Kotlin nativo) no comparten lenguaje, estos
contratos no pueden ser código compartido literal: se expresan como especificación de API
(OpenAPI/JSON Schema), de la que cada lado genera o deriva sus propios tipos.

## Contratos publicados

```
shared/
├── api/
│   └── entradas-mercado-secundario.openapi.json   API REST del CU-006
├── eventos/
│   └── entrada-transferida.schema.json            Evento ENTRADA_TRANSFERIDA
└── seguridad/
    └── token-sesion.md                            Token de sesión y su revocación (RNF-06)
```

### `seguridad/token-sesion.md`

Qué lleva el token que emite el Servicio de Administración, con qué se firma y verifica, y cómo se
anuncia en Redis una sesión cerrada. Es la única parte de la autenticación que los servicios tienen
que acordar.


### `api/entradas-mercado-secundario.openapi.json`

Especificación **OpenAPI 3** del Servicio de Entradas y Mercado Secundario: 12 operaciones que
cubren los 13 pasos del CU-006 y sus nueve caminos alternos.

**Se genera desde el código**, no se escribe a mano:

```bash
cd ../services/entradas-mercado-secundario
npm run contrato:api
```

Escrito a mano se quedaría obsoleto en cuanto alguien añadiera un campo a un DTO, y entonces
mentiría — que es peor que no tenerlo. Generarlo desde los mismos decoradores que definen los
endpoints garantiza que describe lo que el servicio hace de verdad. Hay pruebas que comprueban que
sigue publicando las operaciones del CU-006 y que no expone datos de tarjeta (RNF-05) ni el
identificador del vendedor a los compradores.

De aquí puede generarse el cliente de cada frontend: el portal (TypeScript) y el móvil (Dart) no
comparten lenguaje, que es exactamente la razón por la que este README pedía una especificación de
API y no código compartido.

### `eventos/entrada-transferida.schema.json`

`ENTRADA_TRANSFERIDA` — el evento que emite el Servicio de Entradas al completarse una reventa
(CU-006, pasos 12 y 13). Lo consumen los procesos de notificación, liquidación y auditoría.

Está como **JSON Schema** y no como código porque los consumidores pueden no ser TypeScript: es
justo el caso que este README anticipaba. El servicio de Entradas mantiene además su propia interfaz
de TypeScript (`src/reventa/eventos/entrada-transferida.evento.ts`), y una prueba automática
comprueba que lo que emite valida contra este esquema — dos definiciones del mismo contrato se
desincronizan solas si nadie las ata.

**Está versionado** (`version: 1`). Un cambio incompatible exige una versión nueva, no editar esta:
hay consumidores en otros microservicios que dependen de su forma. Un consumidor que reciba una
versión que no entiende debe mandar el mensaje a la cola de muertos en lugar de interpretarlo a
medias.

La topología de RabbitMQ que lo transporta (exchange, colas y DLQ) la documenta
`services/entradas-mercado-secundario/README.md`.

**Estado:** los dos contratos del CU-006 están publicados. Los demás dominios añadirán los suyos
cuando los implementen; la convención es la misma — OpenAPI para las API REST en `api/`, JSON Schema
para los eventos de la cola en `eventos/`, y ambos generados o verificados desde el código, nunca
mantenidos a mano en paralelo.
