import { Routes } from '@angular/router';
import { authGuard } from './core/auth.guard';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'login' },
  {
    path: 'login',
    loadComponent: () => import('./login/login.component').then((m) => m.LoginComponent)
  },
  {
    path: 'admin',
    canActivate: [authGuard],
    loadComponent: () => import('./shell/shell.component').then((m) => m.ShellComponent),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'inicio' },
      {
        path: 'inicio',
        loadComponent: () => import('./dashboard/dashboard.component').then((m) => m.DashboardComponent),
        data: { titulo: 'Inicio' }
      },
      // CU-026: gestión de eventos contra eventos-recintos (Núcleo).
      {
        path: 'eventos',
        loadComponent: () =>
          import('./eventos/eventos-lista.component').then((m) => m.EventosListaComponent),
        data: { titulo: 'Eventos' }
      },
      {
        path: 'eventos/nuevo',
        loadComponent: () =>
          import('./eventos/evento-formulario.component').then((m) => m.EventoFormularioComponent),
        data: { titulo: 'Nuevo evento' }
      },
      {
        path: 'eventos/:id',
        loadComponent: () =>
          import('./eventos/evento-formulario.component').then((m) => m.EventoFormularioComponent),
        data: { titulo: 'Editar evento' }
      },
      // Secciones todavía sin construir — el menú y el ruteo ya quedan listos
      // para que cada una se implemente bajo pedido, como en el móvil.
      // CU-007: fichas del personal y su asignación a eventos.
      {
        path: 'personal',
        loadComponent: () => import('./personal/empleados.component').then((m) => m.EmpleadosComponent),
        data: { titulo: 'Empleados' }
      },
      {
        path: 'personal/asignaciones',
        loadComponent: () => import('./personal/asignaciones.component').then((m) => m.AsignacionesComponent),
        data: { titulo: 'Asignación a eventos' }
      },
      // CU-008 y CU-009: van antes de `personal/:id`, que si no se las queda.
      {
        path: 'personal/cambios',
        loadComponent: () => import('./personal/cambios-turno.component').then((m) => m.CambiosTurnoComponent),
        data: { titulo: 'Cambios de turno' }
      },
      {
        path: 'personal/asistencia',
        loadComponent: () => import('./personal/asistencia.component').then((m) => m.AsistenciaComponent),
        data: { titulo: 'Asistencia' }
      },
      {
        path: 'personal/nuevo',
        loadComponent: () => import('./personal/empleado-ficha.component').then((m) => m.EmpleadoFichaComponent),
        data: { titulo: 'Nuevo empleado' }
      },
      {
        path: 'personal/:id',
        loadComponent: () => import('./personal/empleado-ficha.component').then((m) => m.EmpleadoFichaComponent),
        data: { titulo: 'Ficha del empleado' }
      },
      // CU-019: panel de monitoreo en tiempo real.
      {
        path: 'monitoreo',
        loadComponent: () => import('./monitoreo/monitoreo.component').then((m) => m.MonitoreoComponent),
        data: { titulo: 'Panel del evento' }
      },
      {
        path: 'incidentes',
        loadComponent: () => import('./placeholder/placeholder.component').then((m) => m.PlaceholderComponent),
        data: { titulo: 'Incidentes', casoDeUso: 'CU-020' }
      },
      // CU-010: evacuación ante emergencias.
      {
        path: 'emergencias',
        loadComponent: () => import('./emergencias/emergencias.component').then((m) => m.EmergenciasComponent),
        data: { titulo: 'Evacuación ante emergencias' }
      },
      // CU-024 y CU-025: cobro y ocupación del parqueadero.
      {
        path: 'parqueaderos',
        loadComponent: () => import('./parqueaderos/parqueaderos.component').then((m) => m.ParqueaderosComponent),
        data: { titulo: 'Parqueaderos' }
      },
      // CU-027B: la primera sección conectada al backend de verdad.
      {
        path: 'cuentas',
        loadComponent: () => import('./cuentas/cuentas.component').then((m) => m.CuentasComponent),
        data: { titulo: 'Cuentas de usuario' }
      },
      {
        path: 'roles',
        loadComponent: () => import('./placeholder/placeholder.component').then((m) => m.PlaceholderComponent),
        data: { titulo: 'Roles y permisos', casoDeUso: 'CU-028' }
      },
      // CU-029: recintos, zonas y plano.
      {
        path: 'recintos',
        loadComponent: () => import('./recintos/recintos-lista.component').then((m) => m.RecintosListaComponent),
        data: { titulo: 'Recintos' }
      },
      {
        path: 'recintos/nuevo',
        loadComponent: () => import('./recintos/recinto-formulario.component').then((m) => m.RecintoFormularioComponent),
        data: { titulo: 'Nuevo recinto' }
      },
      {
        path: 'recintos/:id',
        loadComponent: () => import('./recintos/recinto-formulario.component').then((m) => m.RecintoFormularioComponent),
        data: { titulo: 'Editar recinto' }
      },
      {
        path: 'proveedores',
        loadComponent: () => import('./placeholder/placeholder.component').then((m) => m.PlaceholderComponent),
        data: { titulo: 'Proveedores', casoDeUso: 'CU-030' }
      },
      {
        path: 'pagos',
        loadComponent: () => import('./placeholder/placeholder.component').then((m) => m.PlaceholderComponent),
        data: { titulo: 'Pagos y conciliación financiera', casoDeUso: 'CU-031' }
      },
      {
        path: 'reportes',
        loadComponent: () => import('./placeholder/placeholder.component').then((m) => m.PlaceholderComponent),
        data: { titulo: 'Reportes y analítica del evento', casoDeUso: 'CU-032' }
      }
    ]
  },
  { path: '**', redirectTo: 'login' }
];
