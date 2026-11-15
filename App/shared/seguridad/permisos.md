# Contrato: permisos dinámicos (CU-028)

Lo escribe el módulo **Identidad** del Núcleo cuando un administrador cambia un rol, y lo leen el
gateway y la guarda común del Núcleo (`backend/compartido/seguridad/sesion-valida.guard.ts`). El
código vive en `backend/compartido/seguridad/permisos.ts`; cambiar un punto en un lado sin el otro
deja permisos que no se aplican, o que no se retiran.

## Roles

- **Del sistema:** `Cliente`, `Personal`, `Organizador`, `Administrador`. Sus reglas las declara
  cada ruta (`@RolesPermitidos`) y no tienen matriz.
- **Propios:** cualquier otro nombre del campo `roles` del token. Suman los permisos de su matriz.
  El nombre no cambia después de creado.

## Matriz

Pares `modulo:accion`.

| Módulo | Rutas del gateway |
|---|---|
| `eventos` | `/eventos`, `/recintos` |
| `personal` | `/logistica` (supervisión) |
| `parqueaderos` | `/parqueaderos` (panel, zonas, ingresos; no las reservas ni los pagos del cliente) |
| `emergencias` | `/emergencias` |
| `reportes` | `/monitoreo` |

Acciones: `leer` (GET), `crear` (POST), `actualizar` (PUT, PATCH y los POST que cambian algo que ya
existe), `eliminar` (DELETE).

## Redis

```
permisos-rol:<nombre del rol>   SET   miembros "modulo:accion"     sin caducidad
roles-usuario:<id de usuario>   JSON  ["Cliente","Supervisor"]     PX = vida del token + 60 s
```

- **`permisos-rol`:** Identidad lo reescribe en cada cambio del rol y lo borra al eliminarlo. Al
  arrancar, lo reconstruye desde la base.
- **`roles-usuario`:** solo existe para quien cambió de roles hace menos de lo que dura un token. Si
  existe, manda sobre el campo `roles` del token.
- **Escritura:** Identidad escribe dentro de la transacción del cambio. Si Redis no responde, el
  cambio no se guarda (`503 PERMISOS_NO_DISPONIBLES`).

## Gateway

Una ruta con `$roles_requeridos` y `$modulo_permiso` deja pasar un token que traiga algún rol
propio, aunque no tenga los requeridos. Decide el Núcleo, que lee la matriz vigente.
