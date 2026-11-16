import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { AuthService } from './auth.service';
import { DisponibilidadParqueadero, ReservaParqueadero, TipoVehiculo } from './models';
import { Servidor } from './servidor';

/**
 * Parqueadero del cliente (CU-021) contra el backend real, por el gateway.
 *
 * Igual que la compra de entradas, en dos pasos: **reservar** retiene un
 * espacio (lo asigna el servidor, CU-023) y devuelve el precio ya calculado;
 * **pagar** cobra y entrega el QR que se presenta en el punto de control
 * (CU-022). La app móvil usa estas mismas rutas (RNF-14).
 */
@Injectable({ providedIn: 'root' })
export class ParqueaderoService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);

  private readonly _reservas = signal<ReservaParqueadero[]>([]);
  readonly reservas = this._reservas.asReadonly();

  private url(ruta: string): string {
    return `${Servidor.api}/parqueaderos${ruta}`;
  }

  /** Pasos 1-2. */
  disponibilidad(eventoId: string, llegada?: string): Promise<DisponibilidadParqueadero> {
    const params = llegada ? new HttpParams().set('llegada', llegada) : undefined;
    return this.auth.conAcceso((cabeceras: HttpHeaders) =>
      this.http.get<DisponibilidadParqueadero>(this.url(`/eventos/${eventoId}/disponibilidad`), { headers: cabeceras, params })
    );
  }

  /** Pasos 3-4. Sin espacio en la zona responde CU-021A con las zonas alternativas. */
  reservar(eventoId: string, datos: { zonaId: string; placa: string; tipoVehiculo: TipoVehiculo; llegada?: string }): Promise<ReservaParqueadero> {
    return this.auth.conAcceso((cabeceras: HttpHeaders) =>
      this.http.post<ReservaParqueadero>(this.url(`/eventos/${eventoId}/reservas`), datos, { headers: cabeceras })
    );
  }

  /** Pasos 5-9. Un rechazo (CU-021B) deja la reserva viva para reintentar; reintentar no cobra dos veces. */
  async pagar(reservaId: string, token: string): Promise<ReservaParqueadero> {
    const reserva = await this.auth.conAcceso((cabeceras: HttpHeaders) =>
      this.http.post<ReservaParqueadero>(this.url(`/reservas/${reservaId}/pagar`), { token }, { headers: cabeceras })
    );
    await this.cargar();
    return reserva;
  }

  async cargar(): Promise<void> {
    this._reservas.set(
      await this.auth.conAcceso((cabeceras: HttpHeaders) => this.http.get<ReservaParqueadero[]>(this.url('/reservas'), { headers: cabeceras }))
    );
  }
}
