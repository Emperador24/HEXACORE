import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom, timeout } from 'rxjs';
import { EventoCartelera } from './models';
import { Servidor } from './servidor';

/**
 * Eventos publicados de la cartelera (Catálogo, CU-005), para elegir a qué
 * evento se asigna personal. Es pública: no necesita sesión.
 *
 * Personal/Logística guarda el `eventoId` como referencia lógica, sin llave
 * foránea: el Núcleo no lee la base de Boletería (ADR-16). Por eso el evento se
 * elige de aquí y no se escribe a mano.
 */
@Injectable({ providedIn: 'root' })
export class CarteleraApiService {
  private readonly http = inject(HttpClient);

  async proximos(): Promise<EventoCartelera[]> {
    const respuesta = await firstValueFrom(
      this.http
        .get<{ eventos: EventoCartelera[] }>(`${Servidor.api}/cartelera`, { params: { limite: '100' } })
        .pipe(timeout(15_000))
    );
    return respuesta.eventos;
  }
}
