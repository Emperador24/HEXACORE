import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { CategoriaEvento, Evento } from './models';
import { Servidor } from './servidor';

/** Un evento del listado, tal como lo devuelve `GET /cartelera`. */
interface EventoResumenApi {
  id: string;
  nombre: string;
  categoria: string;
  fechaInicio: string;
  lugar: string;
  ciudad: string;
  imagenUrl: string | null;
  precioDesde: number | null;
  agotado: boolean;
  pasado: boolean;
}

interface CarteleraApi {
  eventos: EventoResumenApi[];
  total: number;
}

/** El detalle, con sus localidades: `GET /cartelera/{id}`. */
interface EventoDetalleApi extends EventoResumenApi {
  localidades: { id: string; nombre: string; precio: number; disponibles: number; agotada: boolean }[];
}

/**
 * Cartelera de eventos (CU-005) contra el backend real, a través del gateway.
 *
 * Es pública: no lleva token. El gateway solo deja pasar GET por esta ruta
 * (ver App/gateway/nginx.conf), así que ver eventos y precios no exige sesión;
 * la sesión se pide al comprar.
 *
 * Carga la cartelera una vez al crearse, porque dos pantallas la leen como
 * señal síncrona: la lista de eventos y el parqueadero (que elige evento de
 * ella). Los filtros de la lista se siguen resolviendo en memoria: la
 * cartelera cabe entera en una página de 100.
 */
@Injectable({ providedIn: 'root' })
export class EventosService {
  private readonly http = inject(HttpClient);

  private readonly _eventos = signal<Evento[]>([]);
  readonly eventos = this._eventos.asReadonly();
  readonly cargando = signal(true);
  readonly error = signal<string | null>(null);

  /** Ciudades presentes en la cartelera, para el filtro de la página de eventos. */
  readonly ciudades = computed(() => [...new Set(this._eventos().map((e) => e.ciudad))].sort());

  constructor() {
    void this.cargar();
  }

  /** Trae la cartelera completa, pasados incluidos (la lista los separa en "Anteriores"). */
  async cargar(): Promise<void> {
    this.cargando.set(true);
    this.error.set(null);
    try {
      const parametros = new HttpParams().set('incluirPasados', 'true').set('limite', '100');
      const respuesta = await firstValueFrom(
        this.http.get<CarteleraApi>(`${Servidor.api}/cartelera`, { params: parametros })
      );
      this._eventos.set(respuesta.eventos.map((e) => aEvento(e)));
    } catch {
      this.error.set('No se pudo cargar la cartelera. Revisa tu conexión e inténtalo de nuevo.');
    } finally {
      this.cargando.set(false);
    }
  }

  /** Lo que ya está cargado. Lo usa el parqueadero, que no necesita las localidades. */
  obtenerPorId(id: string): Evento | undefined {
    return this._eventos().find((e) => e.id === id);
  }

  /** El detalle con sus localidades, precios y cupos al momento (CU-005, pasos 6-8). */
  async detalle(id: string): Promise<Evento> {
    const e = await firstValueFrom(this.http.get<EventoDetalleApi>(`${Servidor.api}/cartelera/${id}`));
    return {
      ...aEvento(e),
      zonas: e.localidades.map((l) => ({
        id: l.id,
        nombre: l.nombre,
        precio: l.precio,
        disponibles: l.disponibles,
        agotada: l.agotada
      }))
    };
  }
}

function aEvento(e: EventoResumenApi): Evento {
  return {
    id: e.id,
    nombre: e.nombre,
    fecha: fechaEnColombia(e.fechaInicio),
    lugar: e.lugar,
    ciudad: e.ciudad,
    categoria: e.categoria as CategoriaEvento,
    precioDesde: e.precioDesde ?? 0,
    pasado: e.pasado,
    imagenUrl: e.imagenUrl,
    zonas: []
  };
}

/**
 * El backend manda un instante (UTC); las pantallas quieren el día en
 * Colombia, en formato yyyy-MM-dd. Un evento a las 8 p. m. del 12 es, en UTC,
 * la 1 a. m. del 13: cortar el ISO lo pondría un día después.
 */
function fechaEnColombia(iso: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bogota' }).format(new Date(iso));
}
