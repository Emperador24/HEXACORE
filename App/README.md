# App

Estructura del **Sistema Integral de Gestión de Eventos** (prototipo funcional, Entrega 2), derivada
de las vistas de contenedores y componentes del SAD
(`Documentation/Work/DescripcionArquitecturaSoftware.tex`, secciones 8-9). Todavía no hay código: cada
carpeta contiene un `README.md` con su rol, los casos de uso que cubre y quién la desarrolla, para que
cada integrante empiece a trabajar en la suya sin pisar las de los demás.

El stack de las cuatro interfaces ya está definido (ver tabla abajo); el lenguaje de los
microservicios de `services/` y el motor de la cola de mensajes (ADR-04) siguen abiertos — se
definen al empezar el prototipo. Ver `../WORKFLOW.md` para el flujo de ramas y la convención del
repo personal de patrones.

## Stack técnico

| Interfaz/capa | Stack | Motivo |
|---|---|---|
| `portal-web-cliente`, `portal-web-admin` | **Angular + TypeScript** | Estructura consistente para trabajo en paralelo (guards/interceptors por rol), RxJS encaja con actualizaciones en tiempo real (ASR-05) |
| `app-movil-cliente`, `app-movil-personal` | **Kotlin nativo** (Android Studio, Jetpack Compose) | Lenguaje ya conocido por el equipo; estándar oficial de Android; coroutines/Flow para tiempo real y notificaciones (evacuación, turnos) |
| `services/*` (backend) | Por definir | No condicionado por el frontend — solo debe exponer contratos vía API Gateway (ASR-10) |
| BD transaccional (todos los dominios) | **PostgreSQL** | Motor relacional por microservicio (ADR-01), ACID para flujos concurrentes como la reventa de entradas (junto con el lock de Redis, ADR-03) |
| BD de Reportes/analítica (`administracion`) | **MongoDB** | Esquema documental para datos semi-estructurados de reportes (polyglot persistence, sección 12 del SAD) |
| Caché / bloqueo distribuido | **Redis** (ADR-03) | Ya decidido — sin cambios |

Como el frontend web (TypeScript) y el móvil (Kotlin) no comparten lenguaje, los contratos en
`shared/` deben expresarse como especificación de API (OpenAPI/JSON Schema) y no como código
compartido — ver `shared/README.md`.

## Estructura

```
App/
├── gateway/                             API Gateway + balanceador de carga (ADR-02)
├── services/                            Microservicios de dominio (lenguaje por definir)
│   ├── entradas-mercado-secundario/     CU-001–006 — PostgreSQL
│   ├── personal/                        CU-007–009 — PostgreSQL
│   ├── eventos-emergencias/             CU-010, CU-016–020, CU-026 — PostgreSQL
│   ├── parqueaderos/                    CU-021–025 — PostgreSQL
│   ├── pedidos/                         CU-011–015 — PostgreSQL
│   └── administracion/                  CU-027–032 — PostgreSQL (cuentas/roles/recintos/proveedores/pagos) + MongoDB (Reportes)
├── frontend/                            Las cuatro interfaces desplegables (vista de contenedores)
│   ├── portal-web-cliente/              Angular + TypeScript
│   ├── portal-web-admin/                Angular + TypeScript — Portal Web Administrativo/Operativo
│   ├── app-movil-cliente/               Kotlin nativo (Android Studio, Jetpack Compose)
│   └── app-movil-personal/              Kotlin nativo (Android Studio, Jetpack Compose)
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
