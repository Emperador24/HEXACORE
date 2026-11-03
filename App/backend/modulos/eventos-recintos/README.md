# Eventos y recintos (Núcleo)

Dueño del **Evento** (CU-026). Hasta ahora solo existían sus copias en Boletería
(`eventos_referencia` de Ventas, Catálogo, Postventa y Acceso QR), llenadas por semillas.
Esquema propio `eventos_recintos`, el noveno de la base `hexacore`; migración
`1793700000000-EsquemaEventosRecintos`, posterior a la consolidación (sin procedencia histórica).

| Ruta `/api/v1` | Quién | Qué |
|---|---|---|
| GET `recintos` | Organizador, Administrador | Recintos activos con zonas y capacidad (solo lectura; administrarlos es el CU-029) |
| GET `eventos`, GET `eventos/:id` | Organizador, Administrador | Listado y detalle con localidades e historial |
| GET `eventos/disponibilidad` | Organizador, Administrador | Paso 5: conflictos en el recinto y horarios sugeridos |
| POST `eventos`, PUT `eventos/:id` | Organizador | Crear (borrador) y editar, con `version` para no pisar cambios ajenos |
| POST `eventos/:id/publicar` | Organizador | Pasos 6-10 |
| POST `eventos/:id/cancelar` | Organizador | CU-026D, con motivo |
| DELETE `eventos/:id?version=` | Organizador | Solo un borrador nunca publicado |

## Reglas

- **Aforo (paso 4, CU-026B).** Aforo máximo ≤ capacidad del recinto; suma de cupos ≤ aforo
  máximo; suma de cupos de cada zona ≤ capacidad de la zona. El error nombra la zona.
- **Traslape (paso 5, CU-026C).** Ningún evento publicado puede solaparse con otro publicado en
  el mismo recinto. Un borrador no bloquea: al guardarlo se avisa, al publicarlo se rechaza
  (409 `EVENTO_TRASLAPADO`). En ambos casos se sugieren hasta tres horarios libres de la misma
  duración (después del evento que choca y los días siguientes).
- **Concurrencia.** Validar y publicar ocurre con la fila del recinto bloqueada: dos
  publicaciones simultáneas que se traslapan no pueden ganar las dos (probado). Cada cambio
  sube `version`; editar, publicar o cancelar con una versión vieja da 409
  `VERSION_DESACTUALIZADA`.
- **Publicado.** No cambia de recinto ni se quitan o reducen tipos de entrada (ya hay ventas);
  sí se editan datos, horario y precios, y se amplían o añaden tipos.
- **Historial (paso 9).** `historial_eventos`, una fila por cambio con versión, acción,
  estados, usuario, diferencias e instantánea. Sin llave foránea: borrar un borrador conserva
  su rastro. Solo se inserta.
- **Mensajes (pasos 8, CU-026D).** Publicar, editar lo publicado y cancelar lo publicado dejan
  un mensaje en `eventos_salientes` dentro de la misma transacción; `BandejaEventos` lo publica
  después en el exchange `eventos.gestion`. Ver [CONTRATO-EVENTOS.md](CONTRATO-EVENTOS.md).

## Lo que queda fuera (decidido)

- **Boletería no consume todavía el contrato.** Publicar no aparece en la cartelera, y
  cancelar no devuelve el dinero, hasta que Entradas implemente los consumidores descritos en
  el contrato (CU-005, CU-003 de Daniel). El portal lo dice al publicar y al cancelar.
- **Recintos de solo lectura.** Se crean con la semilla; administrarlos es el CU-029.
- **Paso 10 por correo.** La confirmación al organizador es la respuesta y el aviso del
  portal; el Trabajador no tiene plantillas de correo para eventos.

## Comandos

```bash
npm run migracion:eventos:estado
npm run semilla:eventos   # recintos + los 9 eventos de la cartelera demo con sus mismos ids; no borra nada
```

`test/eventos/gestion-eventos.e2e-spec.ts`: 9 escenarios contra el Núcleo compilado, con una
cola real atada a `eventos.gestion` para comprobar lo que Boletería recibiría.
