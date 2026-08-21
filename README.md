# HEXACORE

Repositorio de documentación arquitectónica del **Sistema Integral de Gestión de Eventos**, proyecto del curso de Arquitectura de Software (Pontificia Universidad Javeriana).

## Contenido

```
HEXACORE/
└── Documentation/
    ├── Submission/        Entregables finales (PDF y Excel para calificación)
    └── Work/               Documentos fuente (LaTeX) de los entregables
```

### Entregables (`Documentation/Submission/`)

| Archivo | Descripción |
|---|---|
| `Summary.pdf` | Resumen ejecutivo del proyecto |
| `ArchitecturalProposal.pdf` | Propuesta arquitectónica: atributos de calidad, decisiones y componentes |
| `C4Diagrams.pdf` | Diagramas del modelo C4: contexto, contenedores, componentes, sistema, dinámico y despliegue |
| `CU_eventos_completo.xlsx` | 32 casos de uso (CU-001..CU-032) con atributos de calidad e infraestructura |

### Trabajo en curso (`Documentation/Work/`)

| Archivo | Descripción |
|---|---|
| `Summary.tex` | Fuente LaTeX del resumen ejecutivo |
| `ArchitecturalProposal.tex` | Fuente LaTeX de la propuesta arquitectónica |
| `C4Diagrams.tex` | Fuente LaTeX de los diagramas C4 |

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

## Flujo de trabajo

- Los entregables aprobados viven en `Documentation/Submission/`; las fuentes se editan en `Documentation/Work/` y se recompilan antes de actualizar los PDFs.
- La rama `main` está protegida: **toda modificación debe entrar mediante pull request** con revisión.

## Integrantes

Samuel Emperador.
Sebastián Sánchez.
Diego Coronado.
Daniel Cristancho.
