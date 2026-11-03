# HEXACORE

Repositorio de documentación arquitectónica del **Sistema Integral de Gestión de Eventos**, proyecto del curso de Arquitectura de Software (Pontificia Universidad Javeriana).

## Contenido

```
HEXACORE/
├── App/                    Workspace backend modular, frontends e infraestructura — ver App/README.md
├── Documentation/
│   ├── Submission/         Entregables finales (PDF y Excel para calificación)
│   └── Work/               Documentos fuente (LaTeX) de los entregables
└── WORKFLOW.md             Flujo de ramas y convención de repo personal de patrones
```

### Entregables (`Documentation/Submission/`)

| Archivo | Descripción |
|---|---|
| `DescripcionArquitecturaSoftware.pdf` | SAD: arquitectura vigente (ADR-16), ADR y tácticas |
| `EspecificacionRequisitos.pdf` | SRS: requisitos funcionales y no funcionales |
| `Summary.pdf` | Resumen técnico de la migración |
| `ArchitecturalProposal.pdf` | Decisión arquitectónica vigente y concesiones |
| `C4Diagrams.pdf` | Vistas vigentes: contexto, contenedores, componentes, procesos, despliegue y datos |
| `Presentacion.pdf` | Presentación del cierre técnico de la migración |
| `CU_eventos_completo.xlsx` | 32 casos de uso (CU-001..CU-032) con atributos de calidad e infraestructura |

### Trabajo en curso (`Documentation/Work/`)

| Archivo | Descripción |
|---|---|
| `DescripcionArquitecturaSoftware.tex`, `EspecificacionRequisitos.tex` | Fuentes del SAD y del SRS |
| `ArquitecturaVigente.tex`, `ADR-16-nucleo-modular.tex` | Vistas y decisión vigentes, compartidas por los documentos |
| `Summary.tex`, `ArchitecturalProposal.tex`, `C4Diagrams.tex`, `Presentacion.tex` | Fuentes de los demás entregables |
| `Historico/` | Versiones anteriores a ADR-16, conservadas como historia |

## Casos de uso finales (`CU_eventos_completo.xlsx`)

32 casos de uso, 8 por integrante:

| Módulo | Rango | Autor |
|---|---|---|
| Boletería / Entradas | CU-001 – CU-005 | Daniel Cristancho |
| Mercado Secundario de Entradas *(complejo)* | CU-006 | Samuel Emperador |
| Personal y Emergencias | CU-007 – CU-010 | Samuel Emperador |
| Pedidos / Comida | CU-011 – CU-015 | Sebastián Sánchez |
| Logística del evento | CU-016 – CU-020 | Diego Coronado |
| Parqueadero (reservas y accesos) | CU-021 – CU-023 | Daniel Cristancho |
| Parqueadero (cobro y ocupación) | CU-024 – CU-025 | Samuel Emperador |
| Gestión de Eventos (CRUD) | CU-026 | Samuel Emperador |
| Cuentas, roles y recintos | CU-027 – CU-029 | Sebastián Sánchez |
| Proveedores, pagos y reportes | CU-030 – CU-032 | Diego Coronado |

## Arquitectura vigente y continuación del equipo

[ADR-16 y fuentes actuales](Documentation/Work/README.md),
[guía por integrante](Documentation/Work/GUIA-EQUIPO-MIGRACION.md),
[estado y verificaciones](Documentation/Work/ESTADO-MIGRACION.md),
[corte/reversión pendientes](Documentation/Work/CORTE-Y-REVERSION.md).
Núcleo, Boletería y Trabajador ejecutan lo existente; Operación y CU ausentes siguen
pendientes. La migración está integrada en develop (PR #44); el entorno habitual
todavía no se cortó.

## Flujo de trabajo

- Los entregables aprobados viven en `Documentation/Submission/`; las fuentes se editan en `Documentation/Work/` y se recompilan antes de actualizar los PDFs.
- La rama `main` está protegida: **toda modificación debe entrar mediante pull request** con revisión.
- Para el código del prototipo (`App/`), el flujo de ramas (`main` ← `develop` ← `feature/<nombre>`) y
  la convención de repo personal de patrones están en `WORKFLOW.md`.

## Integrantes

Samuel Emperador.
Sebastián Sánchez.
Diego Coronado.
Daniel Cristancho.
