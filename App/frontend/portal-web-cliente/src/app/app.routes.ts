import { Routes } from '@angular/router';
import { authGuard } from './core/auth.guard';

/**
 * La cartelera y el mercado de reventa son **públicos**: un visitante puede
 * mirar qué eventos hay y a qué precio se revenden sin registrarse, igual que
 * en cualquier taquilla. La sesión solo se exige para lo que es propio del
 * cliente —sus entradas, sus reservas, sus pedidos— y para completar una
 * compra; ese último caso no lo cubre el guard de ruta sino la propia acción
 * de comprar, para que el visitante pueda ver el detalle y el precio antes de
 * que se le pida iniciar sesión.
 *
 * Todas las rutas cuelgan del mismo shell (navbar + pie), con o sin sesión,
 * para que el visitante no perciba dos sitios distintos.
 */
export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./login/login.component').then((m) => m.LoginComponent)
  },
  {
    path: '',
    loadComponent: () => import('./shell/shell.component').then((m) => m.ShellComponent),
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'eventos' },

      // ---- Público ----
      // CU-001..CU-005: consulta de la cartelera y detalle del evento.
      {
        path: 'eventos',
        loadComponent: () =>
          import('./eventos/eventos-lista.component').then((m) => m.EventosListaComponent)
      },
      {
        path: 'eventos/:id',
        loadComponent: () =>
          import('./eventos/evento-detalle.component').then((m) => m.EventoDetalleComponent)
      },
      // CU-007, CU-008: se puede mirar el mercado sin sesión; comprar exige iniciarla.
      {
        path: 'reventa',
        loadComponent: () =>
          import('./entradas/mercado-reventa.component').then((m) => m.MercadoReventaComponent)
      },

      // ---- Requiere sesión ----
      // CU-009, CU-010: boletas propias, envío a otro cliente.
      {
        path: 'entradas',
        canActivate: [authGuard],
        loadComponent: () =>
          import('./entradas/mis-entradas.component').then((m) => m.MisEntradasComponent)
      },
      // CU-021..CU-025: reservar y consultar parqueadero.
      {
        path: 'parqueadero',
        canActivate: [authGuard],
        loadComponent: () =>
          import('./parqueadero/parqueadero.component').then((m) => m.ParqueaderoComponent)
      },
      // CU-011..CU-015: restaurantes, menú y pedidos.
      {
        path: 'pedidos',
        canActivate: [authGuard],
        loadComponent: () => import('./pedidos/pedidos.component').then((m) => m.PedidosComponent)
      },
      {
        path: 'pedidos/:id',
        canActivate: [authGuard],
        loadComponent: () =>
          import('./pedidos/menu-establecimiento.component').then(
            (m) => m.MenuEstablecimientoComponent
          )
      },
      // Pasarela de pago compartida por entradas, parqueadero y pedidos (PagoService).
      {
        path: 'pago',
        canActivate: [authGuard],
        loadComponent: () =>
          import('./pago/pasarela-pago.component').then((m) => m.PasarelaPagoComponent)
      },
      {
        path: 'perfil',
        canActivate: [authGuard],
        loadComponent: () => import('./perfil/perfil.component').then((m) => m.PerfilComponent)
      },
      {
        path: 'ajustes',
        canActivate: [authGuard],
        loadComponent: () => import('./ajustes/ajustes.component').then((m) => m.AjustesComponent)
      }
    ]
  },
  { path: '**', redirectTo: 'eventos' }
];
