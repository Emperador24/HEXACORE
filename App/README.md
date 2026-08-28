# App

Estructura del **Sistema Integral de Gestión de Eventos** (prototipo funcional, Entrega 2), derivada
de las vistas de contenedores y componentes del SAD
(`Documentation/Work/DescripcionArquitecturaSoftware.tex`, secciones 8-9). Todavía no hay código: cada
carpeta contiene un `README.md` con su rol, los casos de uso que cubre y quién la desarrolla, para que
cada integrante empiece a trabajar en la suya sin pisar las de los demás.

El stack técnico concreto (lenguaje/framework por servicio) queda abierto — se define al empezar el
prototipo. Ver `../WORKFLOW.md` para el flujo de ramas y la convención del repo personal de patrones.

## Estructura

```
App/
├── gateway/                             API Gateway + balanceador de carga (ADR-02)
├── services/                            Microservicios de dominio, cada uno con BD propia (ADR-01)
│   ├── entradas-mercado-secundario/     CU-001–006
│   ├── personal/                        CU-007–009
│   ├── eventos-emergencias/             CU-010, CU-016–020, CU-026
│   ├── parqueaderos/                    CU-021–025
│   ├── pedidos/                         CU-011–015
│   └── administracion/                  CU-027–032
├── frontend/                            Las cuatro interfaces desplegables (vista de contenedores)
│   ├── portal-web-cliente/
│   ├── portal-web-admin/                Portal Web Administrativo/Operativo
│   ├── app-movil-cliente/
│   └── app-movil-personal/
├── infra/                               Redis, cola de mensajes, bases de datos, despliegue local
└── shared/                              Contratos/DTOs compartidos entre servicios (si se requieren)
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
