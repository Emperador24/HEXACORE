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
        loadComponent: () => import('./dashboard/dashboard.component').then((m) => m.DashboardComponent)
      },
      // CU-026 (CRUD) + CU-016 (planificación de logística).
      {
        path: 'eventos',
        loadComponent: () =>
          import('./eventos/eventos-lista.component').then((m) => m.EventosListaComponent)
      },
      {
        path: 'eventos/nuevo',
        loadComponent: () =>
          import('./eventos/evento-formulario.component').then((m) => m.EventoFormularioComponent)
      },
      {
        path: 'eventos/:id',
        loadComponent: () =>
          import('./eventos/evento-formulario.component').then((m) => m.EventoFormularioComponent)
      },
      // Secciones todavía sin construir — el menú y el ruteo ya quedan listos
      // para que cada una se implemente bajo pedido, como en el móvil.
      {
        path: 'personal',
        loadComponent: () => import('./placeholder/placeholder.component').then((m) => m.PlaceholderComponent),
        data: { titulo: 'Personal', casoDeUso: 'CU-017, CU-018' }
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
      {
        path: 'cuentas',
        loadComponent: () => import('./placeholder/placeholder.component').then((m) => m.PlaceholderComponent),
        data: { titulo: 'Cuentas de usuario', casoDeUso: 'CU-027' }
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
