# Portal Web Administrativo/Operativo

Interfaz web para los roles Organizador, Administrador y Supervisor de emergencia (SAD §8, vista de
contenedores).

**Responsabilidad:** creación y planificación de eventos, gestión de personal y proveedores,
administración de cuentas/roles/recintos, activación y coordinación del protocolo de evacuación,
reportes — consumiendo el backend únicamente a través del API Gateway (`../../gateway`).

**Stack:** Angular 19 + TypeScript, Angular Material.

**Estado:** en construcción (Entrega 2). Ya están el login (con detección de rol, un solo login para
los tres roles — mismo patrón que `app-movil-cliente`), el shell con menú lateral filtrado por rol, y
la sección de **Eventos** completa (CU-026 CRUD + campos de CU-016) con datos mock. El resto de
secciones del menú (Personal, Monitoreo, Incidentes, Emergencias, Cuentas, Roles, Recintos,
Proveedores, Pagos, Reportes) ya tienen su ruta y su entrada en el menú, pero muestran un placeholder
"en construcción" hasta que se implementen una por una.

## Cómo correrlo

```bash
cd frontend/portal-web-admin
npm install   # si no se hizo ya
npm start     # sirve en http://localhost:4200
```

Usuarios demo (clave `1234` para los tres):

| Correo | Rol |
|---|---|
| `organizador@hexacore.com` | Organizador |
| `administrador@hexacore.com` | Administrador |
| `supervisor@hexacore.com` | Supervisor de Emergencia |

## Estructura

```
src/app/
├── core/            Modelos, autenticación mock, guard de sesión, servicio de Eventos, ítems del menú
├── login/           Login único (detecta el rol por el correo)
├── shell/           Toolbar + menú lateral filtrado por rol + <router-outlet>
├── dashboard/        "Inicio": resumen general
├── eventos/         CU-026 (CRUD) + CU-016 (planificación) — lista y formulario crear/editar
└── placeholder/     Pantalla genérica "en construcción" para las secciones pendientes
```
