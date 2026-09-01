# Documentation/Work

Fuentes editables de la documentación: los `.tex`, el `.md` de la bitácora y `Diagrams/` (los
`.drawio`/`.png` de draw.io y los diagramas interactivos de Archify). **Nada más va aquí.**

- Los **PDF compilados** van solo en `../Submission/` — nunca se dejan en `Work/`.
- Los subproductos de LaTeX (`.aux .log .out .toc .fls .fdb_latexmk`) son basura de compilación
  local; `.gitignore` ya los excluye de git, pero **no los dejes en el disco** — bórralos después de
  compilar (ver abajo). Si aparece un archivo suelto tipo `pdflatexNNNNN.fls` (sin nombre de
  documento), es basura de una corrida interrumpida — bórralo.

## Cómo compilar y entregar

```bash
cd "Documentation/Work"
latexmk -pdf NombreDelDocumento.tex        # compila
cp NombreDelDocumento.pdf ../Submission/    # el PDF final va a Submission
latexmk -c NombreDelDocumento.tex           # limpia .aux/.log/.out/.toc/.fls/.fdb_latexmk
```

`latexmk -c` no borra el `.pdf`; bórralo a mano de `Work/` después de copiarlo (`rm NombreDelDocumento.pdf`).
