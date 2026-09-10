import { Injectable, signal } from '@angular/core';
import { Entrada, EstadoEntrada } from './models';

let contadorTicket = 100;
let contadorTransaccion = 500;

function nuevoNumeroTicket(): string {
  contadorTicket += 1;
  return `TCK-2026-${String(contadorTicket).padStart(6, '0')}`;
}

function nuevoNumeroTransaccion(): string {
  contadorTransaccion += 1;
  return `TXN-2026-${String(contadorTransaccion).padStart(6, '0')}`;
}

function nuevoQr(): string {
  return `HXC-QR-${Math.floor(100000 + Math.random() * 900000)}`;
}

/**
 * Entradas del cliente (CU-001..CU-010): compra, boletas propias y mercado
 * de reventa. A diferencia de app-movil-cliente — donde la reventa solo se
 * consulta y la única transferencia posible es "enviar a otro usuario" —
 * aquí es donde vive la reventa real (comprar/publicar), como aclara el
 * comentario de EntradasScreen allá y el README de este portal.
 *
 * Se seedean boletas de otros clientes demo en reventa para que el mercado
 * no esté vacío al entrar por primera vez.
 */
@Injectable({ providedIn: 'root' })
export class EntradasService {
  private readonly _entradas = signal<Entrada[]>([
    {
      id: 'ent-1',
      eventoId: 'evt-1',
      eventoNombre: 'HEXACORE Fest 2026',
      fecha: '12 dic 2026 · 7:00 p. m.',
      lugar: 'Movistar Arena, Bogotá',
      zona: 'General',
      codigoQr: 'HXC-QR-000123',
      estado: EstadoEntrada.VALIDA,
      numeroTicket: 'TCK-2026-000123',
      numeroTransaccion: 'TXN-2026-000501',
      propietarioId: 'usr-cliente-1'
    },
    {
      id: 'ent-3',
      eventoId: 'evt-4',
      eventoNombre: 'Festival de Verano 2026',
      fecha: '15 jun 2026 · 2:00 p. m.',
      lugar: 'Parque Simón Bolívar, Bogotá',
      zona: 'General',
      codigoQr: 'HXC-QR-000099',
      estado: EstadoEntrada.USADA,
      numeroTicket: 'TCK-2026-000099',
      numeroTransaccion: 'TXN-2026-000399',
      propietarioId: 'usr-cliente-1'
    },
    // --- Reventa publicada por otros clientes, para poblar el mercado ---
    {
      id: 'ent-2',
      eventoId: 'evt-2',
      eventoNombre: 'Noche de Rock Nacional',
      fecha: '20 sep 2026 · 8:00 p. m.',
      lugar: 'Coliseo El Campín, Bogotá',
      zona: 'General',
      codigoQr: 'HXC-QR-000124',
      estado: EstadoEntrada.EN_REVENTA,
      numeroTicket: 'TCK-2026-000124',
      numeroTransaccion: 'TXN-2026-000502',
      propietarioId: 'usr-cliente-2',
      precioReventa: 90000
    },
    {
      id: 'ent-4',
      eventoId: 'evt-1',
      eventoNombre: 'HEXACORE Fest 2026',
      fecha: '12 dic 2026 · 7:00 p. m.',
      lugar: 'Movistar Arena, Bogotá',
      zona: 'Palco VIP',
      codigoQr: 'HXC-QR-000201',
      estado: EstadoEntrada.EN_REVENTA,
      numeroTicket: 'TCK-2026-000201',
      numeroTransaccion: 'TXN-2026-000503',
      propietarioId: 'usr-cliente-3',
      precioReventa: 390000
    }
  ]);

  readonly entradas = this._entradas.asReadonly();

  obtenerPorId(id: string): Entrada | undefined {
    return this._entradas().find((e) => e.id === id);
  }

  /** CU-006: compra directa desde el evento, a la zona y cantidad elegidas. */
  comprar(datos: { eventoId: string; eventoNombre: string; fecha: string; lugar: string; zona: string; cantidad: number; propietarioId: string }): void {
    const transaccion = nuevoNumeroTransaccion();
    const nuevas: Entrada[] = Array.from({ length: datos.cantidad }, () => ({
      id: `ent-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      eventoId: datos.eventoId,
      eventoNombre: datos.eventoNombre,
      fecha: datos.fecha,
      lugar: datos.lugar,
      zona: datos.zona,
      codigoQr: nuevoQr(),
      estado: EstadoEntrada.VALIDA,
      numeroTicket: nuevoNumeroTicket(),
      numeroTransaccion: transaccion,
      propietarioId: datos.propietarioId
    }));
    this._entradas.update((lista) => [...nuevas, ...lista]);
  }

  /** Envía la entrada a otro cliente por correo — no hay backend real de mensajería aún, se simula quitándola de la lista, igual que en el móvil. */
  enviar(entradaId: string): void {
    this._entradas.update((lista) => lista.filter((e) => e.id !== entradaId));
  }

  /** CU-007/CU-008: publica una entrada propia en el mercado de reventa. */
  ponerEnReventa(entradaId: string, precio: number): void {
    this._entradas.update((lista) =>
      lista.map((e) => (e.id === entradaId ? { ...e, estado: EstadoEntrada.EN_REVENTA, precioReventa: precio } : e))
    );
  }

  /** Retira una entrada propia del mercado de reventa, sin necesidad de venderla. */
  retirarDeReventa(entradaId: string): void {
    this._entradas.update((lista) =>
      lista.map((e) => (e.id === entradaId ? { ...e, estado: EstadoEntrada.VALIDA, precioReventa: undefined } : e))
    );
  }

  /** CU-007: compra una entrada publicada por otro cliente — cambia de dueño y vuelve a ser válida. */
  comprarEnReventa(entradaId: string, compradorId: string): void {
    this._entradas.update((lista) =>
      lista.map((e) =>
        e.id === entradaId
          ? {
              ...e,
              estado: EstadoEntrada.VALIDA,
              propietarioId: compradorId,
              precioReventa: undefined,
              numeroTransaccion: nuevoNumeroTransaccion(),
              codigoQr: nuevoQr()
            }
          : e
      )
    );
  }
}
