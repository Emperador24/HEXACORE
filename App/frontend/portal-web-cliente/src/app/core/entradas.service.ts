import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { AuthService } from './auth.service';
import { Servidor } from './servidor';

/** Una entrada emitida al pagar: un QR por entrada (salida 1 del CU-001). */
export interface EntradaEmitida {
  id: string;
  numeroTicket: string;
  codigoQr: string;
  localidadNombre: string;
  estado: string;
  /** Lo que se pagó por esta entrada, con el descuento repartido. */
  precioPagado: number;
}

/** Una compra de la venta primaria, tal como la devuelve `/compras`. */
export interface Compra {
  id: string;
  numeroCompra: string;
  /** PENDIENTE → PAGANDO → PAGADA, o EXPIRADA si venció la reserva. */
  estado: string;
  eventoId: string;
  localidadId: string;
  cantidad: number;
  precioUnitario: number;
  subtotal: number;
  descuento: number;
  /** Lo calcula el servidor: el cliente nunca manda un precio. */
  total: number;
  codigoPromocional: string | null;
  /** Hasta cuándo se mantiene apartado el cupo sin pagar (CU-001B). */
  expiraEn: string;
  pagadaEn: string | null;
  motivo: string | null;
  entradas: EntradaEmitida[];
}

/** Respuesta de la Cola virtual al pedir turno. */
interface Turno {
  estado: 'ADMITIDO' | 'EN_ESPERA';
  /** Solo si fue admitido: se manda en `X-Turno-Cola` al reservar, y sirve una vez. */
  token: string | null;
  posicion: number | null;
  reintentarEnSegundos: number | null;
}

/**
 * Compra de entradas (CU-001) contra el backend real, a través del gateway.
 *
 * Igual que la reventa, todas las peticiones pasan por `AuthService.conAcceso`,
 * que pone el token, lo renueva y reintenta una vez ante un 401.
 *
 * La compra tiene dos pasos, igual que en el servidor: **reservar** aparta el
 * cupo y devuelve el total ya calculado, y **pagar** cobra y emite los QR. Así
 * nadie paga por un cupo que ya se llevó otra persona.
 */
@Injectable({ providedIn: 'root' })
export class EntradasService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);

  private url(ruta = ''): string {
    return `${Servidor.api}/compras${ruta}`;
  }

  /**
   * Pasos 3-4: aparta el cupo. Sin cupo, el servidor responde 409 con CU-001A.
   *
   * Antes pasa por la **Cola virtual** (ADR-15): el gateway no deja reservar
   * sin un turno, y lo gasta al reservar. Si hay fila, se espera aquí —el
   * servidor dice cada cuánto volver a preguntar— y `enEspera` recibe el
   * puesto para mostrarlo.
   */
  async reservar(
    eventoId: string,
    localidadId: string,
    cantidad: number,
    enEspera?: (posicion: number) => void
  ): Promise<Compra> {
    const turno = await this.turno(eventoId, enEspera);
    return this.auth.conAcceso((cabeceras: HttpHeaders) =>
      this.http.post<Compra>(
        this.url(),
        { localidadId, cantidad },
        { headers: cabeceras.set('X-Turno-Cola', turno) }
      )
    );
  }

  /**
   * Pide turno hasta que lo den. Volver a pedirlo no manda al final de la
   * fila: la cola conserva el momento de llegada de cada usuario.
   */
  private async turno(eventoId: string, enEspera?: (posicion: number) => void): Promise<string> {
    for (;;) {
      const turno = await this.auth.conAcceso((cabeceras: HttpHeaders) =>
        this.http.post<Turno>(`${Servidor.api}/cola/eventos/${eventoId}/turnos`, {}, { headers: cabeceras })
      );
      if (turno.estado === 'ADMITIDO' && turno.token) return turno.token;
      enEspera?.(turno.posicion ?? 0);
      await new Promise((resolver) => setTimeout(resolver, (turno.reintentarEnSegundos ?? 3) * 1000));
    }
  }

  /**
   * Pasos 5-8: cobra y emite las entradas. Si la pasarela rechaza (CU-001C), la
   * reserva sigue viva y se puede reintentar con otro medio; reintentar es
   * seguro, el servidor no cobra dos veces.
   */
  pagar(compraId: string, metodoPago: string, token: string): Promise<Compra> {
    return this.auth.conAcceso((cabeceras: HttpHeaders) =>
      this.http.post<Compra>(this.url(`/${compraId}/pagar`), { metodoPago, token }, { headers: cabeceras })
    );
  }

  /** Las compras de la cuenta, las más recientes primero. */
  misCompras(): Promise<Compra[]> {
    return this.auth.conAcceso((cabeceras: HttpHeaders) =>
      this.http.get<Compra[]>(this.url(), { headers: cabeceras })
    );
  }

  /** Una compra con sus entradas y QR (solo las que siguen siendo de quien pregunta). */
  detalle(compraId: string): Promise<Compra> {
    return this.auth.conAcceso((cabeceras: HttpHeaders) =>
      this.http.get<Compra>(this.url(`/${compraId}`), { headers: cabeceras })
    );
  }
}
