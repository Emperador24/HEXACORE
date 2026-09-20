# Documentation/Work

Fuentes editables de la documentación: los `.tex`, el `.md` de la bitácora y `Diagrams/` (los
`.drawio`/`.png` de draw.io y los diagramas interactivos de Archify). **Nada más va aquí.**

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
