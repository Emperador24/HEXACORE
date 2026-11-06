import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { AuthService } from './auth.service';
import { DecisionPanel, EventoMonitoreable, PanelMonitoreo, TipoDecision } from './models';
import { Servidor } from './servidor';

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
  seguir(eventoId: string, alRecibir: (p: PanelMonitoreo) => void, alCaer: (motivo: string) => void): () => void {
    const control = new AbortController();
    void (async () => {
      try {
        const token = await this.auth.tokenVigente();
        const respuesta = await fetch(this.url(`/eventos/${eventoId}/flujo`), {
          headers: { Authorization: `Bearer ${token}`, Accept: 'text/event-stream' },
          signal: control.signal
        });
        if (!respuesta.ok || !respuesta.body) throw new Error(`El flujo respondió ${respuesta.status}`);
        const lector = respuesta.body.getReader();
        const decoder = new TextDecoder();
        let pendiente = '';
        for (;;) {
          const { value, done } = await lector.read();
          if (done) break;
          pendiente += decoder.decode(value, { stream: true });
          // Cada evento termina en una línea vacía.
          let corte: number;
          while ((corte = pendiente.indexOf('\n\n')) >= 0) {
            const bloque = pendiente.slice(0, corte);
            pendiente = pendiente.slice(corte + 2);
            const tipo = /^event: (.+)$/m.exec(bloque)?.[1];
            const datos = bloque.split('\n').filter((l) => l.startsWith('data: ')).map((l) => l.slice(6)).join('\n');
            if (tipo === 'panel' && datos) alRecibir(JSON.parse(datos) as PanelMonitoreo);
          }
        }
        alCaer('El servidor cerró el flujo.');
      } catch (e) {
        if (!control.signal.aborted) alCaer(e instanceof Error ? e.message : 'Sin conexión con el flujo.');
      }
    })();
    return () => control.abort();
  }
}
