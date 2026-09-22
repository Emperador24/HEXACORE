import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { AuthService, ErrorCuenta } from './auth.service';
import { Servidor } from './servidor';

/**
 * Mercado secundario de entradas — CU-006, contra el backend real.
 *
 * Todas las peticiones pasan por `AuthService.conAcceso`, que es quien pone el
 * token, lo renueva un minuto antes de que caduque y reintenta una vez si el
 * servidor responde 401. Es la misma máquina que usa la app móvil: la sesión no
 * se gestiona dos veces ni de dos maneras distintas.
 *
 * El servicio no guarda estado. Las pantallas piden lo que necesitan cuando lo
 * necesitan, porque el mercado cambia por debajo: una publicación que estaba
 * hace diez segundos puede estar reservada por otra persona ahora.
 */

/** Una entrada de la persona que mira, con el veredicto de si puede revenderla. */
export interface EntradaPropia {
  id: string;
  numeroTicket: string;
  eventoId: string;
  eventoNombre: string;
  lugar: string;
  localidadNombre: string;
  precioOriginal: number;
  estado: string;
  fechaEvento: string;
  /** Lo decide el servidor: estado, ventana de reventa y políticas del evento. */
  puedePublicarse: boolean;
  /** Tope permitido sobre el precio original; `null` si no se puede publicar. */
  precioMaximo: number | null;
  /** Si ya está publicada, su publicación. */
  publicacionId?: string | null;
  precioReventa?: number | null;
}

/** Una publicación vista desde el mercado. */
export interface PublicacionMercado {
  id: string;
  entradaId: string;
  precio: number;
  precioOriginal: number;
  estado: string;
  eventoId: string;
  eventoNombre: string;
  lugar: string;
  ciudad: string;
  localidadNombre: string;
  fechaEvento: string;
  fechaPublicacion: string;
  fechaExpiracion: string;
  /** El catálogo no oculta las propias: las marca, y la compra las rechaza. */
  esPropia: boolean;
}

export interface Mercado {
  publicaciones: PublicacionMercado[];
  total: number;
  limite: number;
  desplazamiento: number;
}

export interface FiltrosMercado {
  eventoId?: string;
  orden?: string;
  limite?: number;
  desplazamiento?: number;
}

/** Una reserva abierta: la entrada queda bloqueada mientras se paga. */
export interface Checkout {
  id: string;
  numeroTransaccion: string;
  publicacionId: string;
  estado: string;
  precio: number;
  comision: number;
  netoVendedor: number;
  reservaHasta: string;
  /** Lo calcula el servidor al responder; el reloj del navegador no manda. */
  segundosRestantes: number;
  publicacion: PublicacionMercado;
}

export interface ResultadoCompra {
  numeroTransaccion: string;
  estado: string;
  transferida: boolean;
  codigoQr: string;
  entradaId: string;
  numeroTicket: string;
  eventoNombre: string;
  localidadNombre: string;
  precio: number;
  referenciaPasarela: string | null;
}

export interface Publicacion {
  id: string;
  entradaId: string;
  vendedorId: string;
  precio: number;
  precioOriginal: number;
  estado: string;
  eventoNombre: string;
  localidadNombre: string;
}

@Injectable({ providedIn: 'root' })
export class ReventaService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);

  private url(ruta: string): string {
    return `${Servidor.api}/reventa/${ruta}`;
  }

  /** Paso 1: las entradas de la cuenta, con el veredicto de cada una. */
  misEntradas(): Promise<EntradaPropia[]> {
    return this.auth.conAcceso((cabeceras: HttpHeaders) =>
      this.http.get<EntradaPropia[]>(this.url('mis-entradas'), { headers: cabeceras })
    );
  }

  /** Paso 5: el catálogo. Sin las propias publicaciones: nadie se compra su entrada. */
  consultarMercado(filtros: FiltrosMercado = {}): Promise<Mercado> {
    let parametros = new HttpParams();
    for (const [clave, valor] of Object.entries(filtros)) {
      if (valor !== undefined && valor !== null && valor !== '') {
        parametros = parametros.set(clave, String(valor));
      }
    }
    return this.auth.conAcceso((cabeceras: HttpHeaders) =>
      this.http.get<Mercado>(this.url('publicaciones'), { headers: cabeceras, params: parametros })
    );
  }

  detalle(publicacionId: string): Promise<PublicacionMercado> {
    return this.auth.conAcceso((cabeceras: HttpHeaders) =>
      this.http.get<PublicacionMercado>(this.url(`publicaciones/${publicacionId}`), {
        headers: cabeceras
      })
    );
  }

  /** Pasos 1-4: publicar. El servidor valida propiedad, estado, ventana y tope. */
  publicar(entradaId: string, precio: number): Promise<Publicacion> {
    return this.auth.conAcceso((cabeceras: HttpHeaders) =>
      this.http.post<Publicacion>(this.url('publicaciones'), { entradaId, precio }, { headers: cabeceras })
    );
  }

  cambiarPrecio(publicacionId: string, precio: number): Promise<Publicacion> {
    return this.auth.conAcceso((cabeceras: HttpHeaders) =>
      this.http.patch<Publicacion>(this.url(`publicaciones/${publicacionId}`), { precio }, { headers: cabeceras })
    );
  }

  /** CU-006B: retirar del mercado. Falla si alguien la tiene reservada. */
  retirar(publicacionId: string): Promise<Publicacion> {
    return this.auth.conAcceso((cabeceras: HttpHeaders) =>
      this.http.delete<Publicacion>(this.url(`publicaciones/${publicacionId}`), { headers: cabeceras })
    );
  }

  /**
   * Paso 6: reservar. Si otra persona se adelantó, el servidor responde 409 con
   * `CU-006H` — de inmediato, sin cola de espera, que es lo que pide el ASR-01.
   */
  iniciarCheckout(publicacionId: string): Promise<Checkout> {
    return this.auth.conAcceso((cabeceras: HttpHeaders) =>
      this.http.post<Checkout>(this.url(`publicaciones/${publicacionId}/checkout`), {}, { headers: cabeceras })
    );
  }

  consultarCheckout(checkoutId: string): Promise<Checkout> {
    return this.auth.conAcceso((cabeceras: HttpHeaders) =>
      this.http.get<Checkout>(this.url(`checkout/${checkoutId}`), { headers: cabeceras })
    );
  }

  /** CU-006C: soltar la reserva antes de tiempo, para que otro pueda comprar. */
  cancelarCheckout(checkoutId: string): Promise<Checkout> {
    return this.auth.conAcceso((cabeceras: HttpHeaders) =>
      this.http.delete<Checkout>(this.url(`checkout/${checkoutId}`), { headers: cabeceras })
    );
  }

  /** Pasos 7-13: cobrar, transferir, emitir el QR nuevo y avisar. */
  pagar(checkoutId: string, metodoPago: string, token: string): Promise<ResultadoCompra> {
    return this.auth.conAcceso((cabeceras: HttpHeaders) =>
      this.http.post<ResultadoCompra>(
        this.url(`checkout/${checkoutId}/pagar`),
        { metodoPago, token },
        { headers: cabeceras }
      )
    );
  }
}

/** El mensaje del servidor, que ya viene redactado para la persona. */
export function mensajeDeError(error: unknown): string {
  if (error instanceof ErrorCuenta) return error.message;
  if (error instanceof Error && error.message) return error.message;
  return 'No se pudo completar la operación. Inténtalo de nuevo.';
}
