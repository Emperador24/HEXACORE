import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { AuthService } from './auth.service';
import { DecisionPanel, EventoMonitoreable, PanelMonitoreo, TipoDecision } from './models';
import { Servidor } from './servidor';
import { seguirFlujo } from './flujo-sse';

export interface DatosDecision {
  tipo: TipoDecision;
  descripcion: string;
  zona?: string;
  puntoAcceso?: string;
  alternativa?: string;
  alertaId?: string;
}

/**
 * CU-019 contra `/api/v1/monitoreo`. El panel llega en vivo por Server-Sent
 * Events (`seguir`); `panel` es la consulta única que se usa si el flujo cae.
 */
@Injectable({ providedIn: 'root' })
export class MonitoreoApiService {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);

  private url(ruta: string): string {
    return `${Servidor.api}/monitoreo${ruta}`;
  }

  eventos(): Promise<EventoMonitoreable[]> {
    return this.auth.conAcceso((h) => this.http.get<EventoMonitoreable[]>(this.url('/eventos'), { headers: h }));
  }

  panel(eventoId: string): Promise<PanelMonitoreo> {
    return this.auth.conAcceso((h) => this.http.get<PanelMonitoreo>(this.url(`/eventos/${eventoId}/panel`), { headers: h }));
  }

  decidir(eventoId: string, datos: DatosDecision): Promise<DecisionPanel> {
    return this.auth.conAcceso((h) => this.http.post<DecisionPanel>(this.url(`/eventos/${eventoId}/decisiones`), datos, { headers: h }));
  }

  resultado(eventoId: string, decisionId: string, resultado: string): Promise<DecisionPanel> {
    return this.auth.conAcceso((h) =>
      this.http.patch<DecisionPanel>(this.url(`/eventos/${eventoId}/decisiones/${decisionId}`), { resultado }, { headers: h })
    );
  }

  /**
   * Sigue el panel en vivo. `EventSource` no deja mandar la cabecera de
   * autorización, así que se lee el flujo con `fetch`. Devuelve una función
   * para cortarlo. Si el flujo se cae o termina, avisa con `alCaer` y quien
   * llama decide reconectar.
   */
  seguir(eventoId: string, alRecibir: (p: PanelMonitoreo) => void, alCaer: (motivo: string, estado?: number) => void): () => void {
    return seguirFlujo(this.url(`/eventos/${eventoId}/flujo`), () => this.auth.tokenVigente(), 'panel', alRecibir, alCaer);
  }
}
