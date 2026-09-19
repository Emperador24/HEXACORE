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
│   ├── entradas-mercado-secundario/     CU-001–006 — PostgreSQL
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
| `services/entradas-mercado-secundario` | CU-001–006 | Daniel Cristancho (001–005), Samuel Emperador (006) |
| `services/personal` | CU-007–009 | Samuel Emperador |
| `services/eventos-emergencias` | CU-010, CU-016–020, CU-026 | Samuel Emperador (010, 026), Diego Coronado (016–020) |
| `services/parqueaderos` | CU-021–025 | Daniel Cristancho (021–023), Samuel Emperador (024–025) |
| `services/pedidos` | CU-011–015 | Sebastián Sánchez |
| `services/administracion` | CU-027–032 | Sebastián Sánchez (027–029), Diego Coronado (030–032) |

La agrupación de `eventos-emergencias`, `pedidos` y `administracion` no está aún detallada como
contenedor propio en la vista de componentes del SAD (solo se documentan en profundidad Entradas,
Personal, Eventos/Emergencias y Parqueaderos); se propone aquí siguiendo el modelo de dominio y el
modelo de datos (sección 12) para que cada CU tenga un lugar claro donde empezar. Ajustar si al
prototipar aparece una mejor separación.
