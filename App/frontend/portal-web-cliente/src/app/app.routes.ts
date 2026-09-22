import { Routes } from '@angular/router';
import { authGuard, soloInvitadosGuard } from './core/auth.guard';

/**
 * La cartelera es **pública**: un visitante puede mirar qué eventos hay sin
 * registrarse, igual que en cualquier taquilla. La sesión se exige para todo lo
 * que es propio del cliente —sus entradas, sus reservas, sus pedidos— y para el
 * mercado de reventa, que aunque parezca un catálogo público no lo es: el
 * servidor marca en cada publicación si es tuya, y eso exige saber quién
 * pregunta.
 *
 * Todas las rutas cuelgan del mismo shell (navbar + pie), con o sin sesión,
 * para que el visitante no perciba dos sitios distintos.
 */
export const routes: Routes = [
  // ---- Cuenta (CU-027), fuera del shell: pantallas propias, como en la app ----
  {
    path: 'login',
    canActivate: [soloInvitadosGuard],
    loadComponent: () => import('./login/login.component').then((m) => m.LoginComponent)
  },
  {
    path: 'registro',
    canActivate: [soloInvitadosGuard],
    loadComponent: () => import('./cuenta/registro.component').then((m) => m.RegistroComponent)
  },
  {
    path: 'recuperar',
    loadComponent: () => import('./cuenta/recuperar.component').then((m) => m.RecuperarComponent)
  },
  // Destinos de los enlaces de los correos (CORREO_URL_BASE_ENLACES del backend).
  {
    path: 'cuenta/verificar',
    loadComponent: () => import('./cuenta/verificar.component').then((m) => m.VerificarComponent)
  },
  {
    path: 'cuenta/restablecer',
    loadComponent: () => import('./cuenta/restablecer.component').then((m) => m.RestablecerComponent)
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
      // ---- Requiere sesión ----
      // CU-006: el mercado secundario. Pide sesión aunque solo se mire, porque
      // el catálogo del servidor marca cuáles publicaciones son tuyas — y eso
      // no se puede responder sin saber quién pregunta.
      {
        path: 'reventa',
        canActivate: [authGuard],
        loadComponent: () =>
          import('./entradas/mercado-reventa.component').then((m) => m.MercadoReventaComponent)
      },
      // CU-006, lado del vendedor: las entradas propias y su publicación.
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
