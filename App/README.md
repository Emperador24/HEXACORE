# App

Estructura del **Sistema Integral de Gestión de Eventos** (prototipo funcional, Entrega 2), derivada
de las vistas de contenedores y componentes del SAD
(`Documentation/Work/DescripcionArquitecturaSoftware.tex`, secciones 8-9). Las **tres interfaces** de
`frontend/` tienen código funcionando; en `services/` están implementados **Entradas y Mercado
Secundario** (CU-006, CU-018) y **Administración** (CU-027), y `gateway/` ya es el punto único de
entrada al backend (ADR-02). El resto de carpetas siguen siendo un `README.md` con su rol, los casos
de uso que cubre y quién la desarrolla, para que cada integrante empiece a trabajar en la suya sin
pisar las de los demás.

El stack completo ya está definido (ver tabla abajo): interfaces, backend y cola de mensajes, estas
dos últimas elegidas con evidencia medida en `PoCs/`. Ver `../WORKFLOW.md` para el flujo de ramas y la
convención del repo personal de patrones.

## Stack técnico

| Interfaz/capa | Stack | Motivo |
|---|---|---|
| `portal-web-cliente`, `portal-web-admin` | **Angular + TypeScript** | Estructura consistente para trabajo en paralelo (guards/interceptors por rol), RxJS encaja con actualizaciones en tiempo real (ASR-05) |
| `app-movil` | **Flutter** (Dart) | Una sola base de código para Android e iOS, y una sola app para los roles Cliente y Personal (ADR-07); sustituye a la implementación Kotlin/Jetpack Compose inicial (ADR-08) |
| `services/*` (backend) | **NestJS** (Node.js + TypeScript) | Elegido con evidencia medida en PoC-04 (ADR-09): ambos candidatos cumplen RNF-07 con 70× de margen, y NestJS gana en arranque, memoria y —sobre todo— en ser el lenguaje que el equipo ya escribe en los portales |
| BD transaccional (todos los dominios) | **PostgreSQL** | Motor relacional por microservicio (ADR-01), ACID para flujos concurrentes como la reventa de entradas (junto con el lock de Redis, ADR-03) |
| BD de Reportes/analítica (`administracion`) | **MongoDB** | Esquema documental para datos semi-estructurados de reportes (polyglot persistence, sección 12 del SAD) |
| Caché / bloqueo distribuido | **Redis** (ADR-03) | Bloqueo del checkout de reventa y lista de sesiones revocadas; comprobado con `rnf01-concurrencia.py` sobre el servicio real |
| Cola de mensajes | **RabbitMQ** (ADR-10) | Elegido con evidencia medida en PoC-05: el uso aquí es cola de tareas, no *event streaming*; DLQ y reintentos nativos (ASR-07, ASR-13), la mitad de memoria y de configuración que Kafka |

Como el frontend web (TypeScript) y el móvil (Dart) no comparten lenguaje, los contratos en
`shared/` deben expresarse como especificación de API (OpenAPI/JSON Schema) y no como código
compartido — ver `shared/README.md`.

## Estructura

```
App/
├── gateway/                             API Gateway + balanceador de carga (ADR-02) — Nginx, puerto 8080
├── services/                            Microservicios de dominio (NestJS, ADR-09)
│   ├── ventas/     CU-001–006 — PostgreSQL
│   ├── personal/                        CU-007–009 — PostgreSQL
│   ├── eventos-emergencias/             CU-010, CU-016–020, CU-026 — PostgreSQL
│   ├── parqueaderos/                    CU-021–025 — PostgreSQL
│   ├── pedidos/                         CU-011–015 — PostgreSQL
│   └── administracion/                  CU-027–032 — PostgreSQL (cuentas/roles/recintos/proveedores/pagos) + MongoDB (Reportes)
├── frontend/                            Las tres interfaces desplegables (vista de contenedores)
│   ├── portal-web-cliente/              Angular + TypeScript — cartelera pública, compra y reventa
│   ├── portal-web-admin/                Angular + TypeScript — Portal Web Administrativo/Operativo
│   └── app-movil/                       Flutter (Dart) — Cliente y Personal en una sola app (ADR-07)
├── PoCs/                                Pruebas de concepto que respaldan los ADR con evidencia medida
├── infra/                               Redis, cola de mensajes, PostgreSQL/MongoDB, despliegue local
└── shared/                              Contratos de API (OpenAPI/JSON Schema) entre servicios y frontends
```

## Mapa de responsables

Igual que en `Submission/DistribucionCasosUso.pdf`, cada bloque de CU mantiene su autor original del SAD:

| Carpeta | CU | Responsable(s) |
|---|---|---|
| `services/ventas` | CU-001–004 | Daniel Cristancho |
| `services/postventa` | CU-006 | Samuel Emperador |
| `services/acceso-qr` | CU-002 | Daniel Cristancho |
| `services/catalogo` | CU-005 | Daniel Cristancho |
| `services/eventos-emergencias` | CU-010, CU-016–020, CU-026 | Samuel Emperador (010, 026), Diego Coronado (016–020) |
| `services/autenticacion` | CU-027–032 | Sebastián Sánchez (027–029), Diego Coronado (030–032) |
| `services/alimentos` | CU-011–015 | Sebastián Sánchez |
| `services/personal` | CU-007–009 | Samuel Emperador |
| `services/parqueaderos` | CU-021–025 | Daniel Cristancho (021–023), Samuel Emperador (024–025) |
| `services/pagos`, `services/cola-virtual`, `services/notificaciones` | transversales | Samuel Emperador |

Los responsables son los del SAD y no cambian al moverse el código: lo que cambia es dónde vive.

**Esta tabla ya refleja ADR-14, no ADR-12.** El Núcleo que ADR-12 había formado se repartió: lo
que era `nucleo/src/modulos/administracion` es hoy `services/autenticacion`, y `.../pedidos` es
`services/alimentos`. Personal y Parqueaderos siguen sin implementar —son un README y un módulo
vacío dentro de Autenticación— y tienen carpeta propia reservada.

De `services/ventas` salieron tres servicios en la fase A: la cartelera a `catalogo`, la puerta a
`acceso-qr` y el mercado secundario a `postventa`. Lo que se quedó es la venta primaria y, sobre
todo, **la tabla `entradas`**: Ventas es su dueño, y los otros dos se la piden por una API interna.
El estado de la migración está en `Documentation/Work/MIGRACION-ADR-14.md`.
