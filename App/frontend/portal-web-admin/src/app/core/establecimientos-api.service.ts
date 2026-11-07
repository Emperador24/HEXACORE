import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { AuthService } from './auth.service';
import { Servidor } from './servidor';

export type EstadoEstablecimiento = 'DISPONIBLE' | 'CERRADO' | 'SATURADO' | 'DESHABILITADO';
export interface DatosEstablecimiento {
  eventoId: string; nombre: string; contacto: string; puntoEntrega: string;
  horaApertura: string; horaCierre: string; zonaHoraria: string; estado: EstadoEstablecimiento;
}
export interface Establecimiento extends DatosEstablecimiento { id: string; recibePedidos: boolean }

@Injectable({ providedIn: 'root' })
export class EstablecimientosApiService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly url = `${Servidor.api}/pedidos/admin/establecimientos`;
  listar(eventoId: string): Promise<Establecimiento[]> {
    return this.auth.conAcceso(h => this.http.get<Establecimiento[]>(this.url, { headers: h, params: { eventoId } }));
  }
  guardar(datos: DatosEstablecimiento, id?: string): Promise<Establecimiento> {
    return this.auth.conAcceso(h => id
      ? this.http.put<Establecimiento>(`${this.url}/${id}`, datos, { headers: h })
      : this.http.post<Establecimiento>(this.url, datos, { headers: h }));
  }
  estado(id: string, estado: EstadoEstablecimiento): Promise<Establecimiento> {
    return this.auth.conAcceso(h => this.http.patch<Establecimiento>(`${this.url}/${id}/estado`, { estado }, { headers: h }));
  }
}
