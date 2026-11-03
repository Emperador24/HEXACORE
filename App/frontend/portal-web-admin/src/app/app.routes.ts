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
      {
        path: 'monitoreo',
        loadComponent: () => import('./placeholder/placeholder.component').then((m) => m.PlaceholderComponent),
        data: { titulo: 'Monitoreo del evento', casoDeUso: 'CU-019' }
      },
      {
        path: 'incidentes',
        loadComponent: () => import('./placeholder/placeholder.component').then((m) => m.PlaceholderComponent),
        data: { titulo: 'Incidentes', casoDeUso: 'CU-020' }
      },
      {
        path: 'emergencias',
        loadComponent: () => import('./placeholder/placeholder.component').then((m) => m.PlaceholderComponent),
        data: { titulo: 'Gestión de evacuación ante emergencias', casoDeUso: 'CU-010' }
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
      {
        path: 'recintos',
        loadComponent: () => import('./placeholder/placeholder.component').then((m) => m.PlaceholderComponent),
        data: { titulo: 'Recintos y zonas', casoDeUso: 'CU-029' }
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
