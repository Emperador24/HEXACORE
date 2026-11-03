# Documentation/Work

Fuentes editables de la documentación: los `.tex`, el `.md` de la bitácora y `Diagrams/` (las
especificaciones JSON de Archify, sus HTML interactivos y los PDF que incluye LaTeX). **Nada más va aquí.**

- Los **PDF compilados** van solo en `../Submission/` — nunca se dejan en `Work/`.
- Los subproductos de LaTeX (`.aux .log .out .toc .fls .fdb_latexmk`) son basura de compilación
  local; `.gitignore` ya los excluye de git, pero **no los dejes en el disco** — bórralos después de
  compilar (ver abajo). Si aparece un archivo suelto tipo `pdflatexNNNNN.fls` (sin nombre de
  documento), es basura de una corrida interrumpida — bórralo.

## Los documentos

| Archivo | Qué es |
|---|---|
| `EspecificacionRequisitos.tex` | **SRS** — qué debe hacer el sistema. |
| `DescripcionArquitecturaSoftware.tex` | **SAD** — cómo se construye y por qué. |
| `ArchitecturalProposal.tex`, `Summary.tex`, `C4Diagrams.tex` | Propuesta, resumen y diagramas. |
| `BitacoraArquitectonica.md` | Bitácora del equipo, una entrada por semana. |

Dos archivos **no se editan a mano**:

- **`RequisitosCasosUso.tex`** — las fichas de los 32 casos de uso dentro del SRS. Se genera desde
  `../Submission/CU_eventos_completo.xlsx`, que sigue siendo la fuente de verdad:

  ```bash
  python3 generar-requisitos-cu.py     # necesita: pip install openpyxl
  ```

  Si corriges un caso de uso, corrígelo **en la hoja de cálculo** y vuelve a generar. Editar el
  `.tex` funciona hasta la siguiente corrida, y entonces se pierde.

- **`RequisitosNoFuncionales.tex`** — la tabla de los 18 RNF. La incluyen **los dos** documentos,
  el SRS y el SAD, para que no puedan divergir. Editarla actualiza ambos.

## Cómo compilar y entregar

```bash
cd "Documentation/Work"
latexmk -pdf NombreDelDocumento.tex        # compila
cp NombreDelDocumento.pdf ../Submission/    # el PDF final va a Submission
latexmk -c NombreDelDocumento.tex           # limpia .aux/.log/.out/.toc/.fls/.fdb_latexmk
```

`latexmk -c` no borra el `.pdf`; bórralo a mano de `Work/` después de copiarlo (`rm NombreDelDocumento.pdf`).

## Vigencia de la entrega técnica de migración (ADR-16)

- Arquitectura implementada: `ArquitecturaVigente.tex`, compartida por SAD,
  propuesta, resumen y C4. Diagramas: siete vistas C4 en `Diagrams/Archify/*.json` (fuente),
  `Diagrams/Archify/*.html` (interactivos) y `Diagrams/ArchifyPDF/*.pdf`, que las macros de
  `Diagrams/Vigente/diagramas.tex` incluyen en todos los documentos. Ver `Diagrams/Archify/README.md`.
- Decisión: `ADR-16-nucleo-modular.tex`. Los ADR anteriores conservan su historia,
  con indicación de qué decisiones sustituye/revisa ADR-16.
- Equipo y pendientes: [GUIA-EQUIPO-MIGRACION.md](GUIA-EQUIPO-MIGRACION.md).
- Corte/reversión **no ejecutados**: [CORTE-Y-REVERSION.md](CORTE-Y-REVERSION.md).
- Evidencia local/remota y límites: ESTADO-MIGRACION §23–24.
- `Historico/` guarda las fuentes/vistas anteriores, incluidos los diagramas draw.io de agosto
  (`Historico/Diagramas-drawio/`); no describen la topología vigente. No borrar esos antecedentes para aparentar coherencia.

Compilar las cinco fuentes actualizadas con salida en un directorio temporal
(`latexmk -pdf -outdir=/ruta/temporal Documento.tex`), revisar referencias/figuras y
copiar únicamente los PDF finales a Submission. No dejar productos en Work.
