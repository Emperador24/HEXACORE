import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { Servidor } from './servidor';

/** Lo que dice el backend: `GET /pagos/configuracion`. */
export interface ConfiguracionPagos {
  proveedor: 'stripe' | 'simulada';
  clavePublica: string | null;
}

/** El formulario de tarjeta montado: se pide el token al pagar y se desmonta al salir. */
export interface TarjetaMontada {
  /** Convierte la tarjeta en un `pm_…`. Lanza `Error` con el mensaje de Stripe si los datos no sirven. */
  crearMetodoPago(): Promise<string>;
  destruir(): void;
}

// Lo poco de Stripe.js que se usa. No se instala el paquete de tipos por cinco
// líneas: Stripe.js se carga siempre desde js.stripe.com (es requisito de
// Stripe para que la tarjeta no pase por nuestra página).
interface ElementoTarjeta {
  mount(contenedor: HTMLElement): void;
  destroy(): void;
  on(evento: 'change', manejador: (e: { error?: { message: string } }) => void): void;
}
interface StripeJs {
  elements(): { create(tipo: 'card', opciones: object): ElementoTarjeta };
  createPaymentMethod(datos: { type: 'card'; card: ElementoTarjeta }): Promise<{
    paymentMethod?: { id: string };
    error?: { message?: string };
  }>;
}
type FabricaStripe = (clavePublica: string) => StripeJs;

const SCRIPT_STRIPE = 'https://js.stripe.com/v3/';

/**
 * Pagos con tarjeta real cuando el backend usa Stripe.
 *
 * El portal no sabe de antemano qué pasarela hay: lo pregunta al gateway una
 * vez, así la misma imagen sirve con la pasarela simulada y con Stripe. Con
 * Stripe, la tarjeta se escribe en un campo que monta Stripe.js (un iframe de
 * js.stripe.com) y lo que llega al backend es solo el `pm_…` (RNF-05).
 */
@Injectable({ providedIn: 'root' })
export class StripeService {
  private readonly http = inject(HttpClient);
  private configuracion?: Promise<ConfiguracionPagos>;
  private stripe?: Promise<StripeJs>;

  /** Si el backend no responde se asume la simulada: el pago sigue funcionando como siempre. */
  configuracionPagos(): Promise<ConfiguracionPagos> {
    this.configuracion ??= firstValueFrom(this.http.get<ConfiguracionPagos>(`${Servidor.api}/pagos/configuracion`)).catch(
      () => ({ proveedor: 'simulada', clavePublica: null }) as ConfiguracionPagos
    );
    return this.configuracion;
  }

  async activo(): Promise<boolean> {
    const c = await this.configuracionPagos();
    return c.proveedor === 'stripe' && !!c.clavePublica;
  }

  async montarTarjeta(contenedor: HTMLElement, alCambiar: (error: string | null) => void): Promise<TarjetaMontada> {
    const stripe = await this.cargar();
    const tarjeta = stripe.elements().create('card', {
      hidePostalCode: true,
      style: { base: { fontSize: '16px', fontFamily: 'Roboto, "Helvetica Neue", sans-serif' } }
    });
    tarjeta.mount(contenedor);
    tarjeta.on('change', (e) => alCambiar(e.error?.message ?? null));
    return {
      crearMetodoPago: async () => {
        const { paymentMethod, error } = await stripe.createPaymentMethod({ type: 'card', card: tarjeta });
        if (!paymentMethod) throw new Error(error?.message ?? 'Revisa los datos de la tarjeta.');
        return paymentMethod.id;
      },
      destruir: () => tarjeta.destroy()
    };
  }

  private cargar(): Promise<StripeJs> {
    this.stripe ??= (async () => {
      const { clavePublica } = await this.configuracionPagos();
      if (!clavePublica) throw new Error('El servidor no tiene Stripe configurado.');
      const ventana = window as Window & { Stripe?: FabricaStripe };
      if (!ventana.Stripe) {
        await new Promise<void>((listo, falla) => {
          const script = document.createElement('script');
          script.src = SCRIPT_STRIPE;
          script.onload = () => listo();
          script.onerror = () => falla(new Error('No se pudo cargar Stripe. Revisa la conexión a internet.'));
          document.head.appendChild(script);
        });
      }
      return ventana.Stripe!(clavePublica);
    })();
    // Si falla (sin internet), que el siguiente intento vuelva a probar.
    this.stripe.catch(() => (this.stripe = undefined));
    return this.stripe;
  }
}
