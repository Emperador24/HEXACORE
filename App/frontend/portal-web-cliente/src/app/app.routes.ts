import { Routes } from '@angular/router';
import { authGuard } from './core/auth.guard';

export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'login' },
  {
    path: 'login',
    loadComponent: () => import('./login/login.component').then((m) => m.LoginComponent)
  },
  {
    path: 'cliente',
    canActivate: [authGuard],
    loadComponent: () => import('./shell/shell.component').then((m) => m.ShellComponent),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'eventos' },
      // CU-001..CU-005 (consulta) + CU-006 (compra).
      {
        path: 'eventos',
        loadComponent: () => import('./eventos/eventos-lista.component').then((m) => m.EventosListaComponent)
      },
      {
        path: 'eventos/:id',
        loadComponent: () => import('./eventos/evento-detalle.component').then((m) => m.EventoDetalleComponent)
      },
      // CU-009, CU-010: boletas propias, envío a otro cliente.
      {
        path: 'entradas',
        loadComponent: () => import('./entradas/mis-entradas.component').then((m) => m.MisEntradasComponent)
      },
      // CU-007, CU-008: mercado de reventa (no vive en app-movil-cliente).
      {
        path: 'reventa',
        loadComponent: () => import('./entradas/mercado-reventa.component').then((m) => m.MercadoReventaComponent)
      },
      // CU-021..CU-025: reservar y consultar parqueadero.
      {
        path: 'parqueadero',
        loadComponent: () => import('./parqueadero/parqueadero.component').then((m) => m.ParqueaderoComponent)
      },
      // CU-011..CU-015: restaurantes, menú y pedidos.
      {
        path: 'pedidos',
        loadComponent: () => import('./pedidos/pedidos.component').then((m) => m.PedidosComponent)
      },
      {
        path: 'pedidos/:id',
        loadComponent: () =>
          import('./pedidos/menu-establecimiento.component').then((m) => m.MenuEstablecimientoComponent)
      },
      // Pasarela de pago compartida por entradas, parqueadero y pedidos (CU-011, PagoService).
      {
        path: 'pago',
        loadComponent: () => import('./pago/pasarela-pago.component').then((m) => m.PasarelaPagoComponent)
      },
      {
        path: 'perfil',
        loadComponent: () => import('./perfil/perfil.component').then((m) => m.PerfilComponent)
      },
      {
        path: 'ajustes',
        loadComponent: () => import('./ajustes/ajustes.component').then((m) => m.AjustesComponent)
      }
    ]
  },
  { path: '**', redirectTo: 'login' }
];
