# Referencia previa a ADR-16

Estas fuentes/vistas conservan propuestas, decisiones y diagramas anteriores.
No son instrucciones de despliegue ni inventario vigente. Los requisitos SRS no
se modifican por archivar una vista. Las fuentes activas del directorio padre
incluyen ArquitecturaVigente y Diagrams/Vigente; ver ADR-16 y ESTADO-MIGRACION.

Los originales completos mantienen rutas relativas a Documentation/Work. Si se
necesita reproducirlos, compilar desde ese directorio con salida fuera de Git;
no sustituir los PDF actuales sin indicar su revisión.

## Comparación de contenedores para la sustentación — 15/11/2026

`Contenedores-ADR14-15.architecture.json` y `Contenedores-ADR14-15.pdf` son copias
**exactas**, recuperadas con `git show 4b8cdd4:<ruta>`, de
`Documentation/Work/Diagrams/Archify/02-contenedores.architecture.json` y
`Documentation/Work/Diagrams/ArchifyPDF/02-contenedores.pdf`, respectivamente.
No se redibujan ni se convierten en arquitectura implementada: representan la
**propuesta anterior ADR-14/15**, de 27 cajas (incluidos externos), frente a la
implementación actual de ADR-16. El PDF previo ya estaba versionado en ese commit.

SHA-256 JSON: `84e932022c61e08a405023d3dbd776048da13b78021b87f885649656a5e2190e`.
SHA-256 PDF: `3d1a1973427978fb889d559575c495d0d3bbc5cb421553f562d99221807b9de9`.
Las vistas actuales conservan su fuente en `../Diagrams/Archify/`; la presentación
muestra ambas revisiones y sus concesiones, sin atribuir el clúster propuesto a
un despliegue que se hubiera realizado.
