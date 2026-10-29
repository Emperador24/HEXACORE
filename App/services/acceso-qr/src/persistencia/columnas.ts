import { ValueTransformer } from 'typeorm';

/**
 * El driver de PostgreSQL devuelve las columnas `numeric` como **string**, no
 * como número: `numeric` tiene más precisión de la que cabe en un `double` de
 * JavaScript, así que convertirlo automáticamente sería perder datos en
 * silencio. Este transformador hace la conversión de forma explícita.
 *
 * Es seguro para los importes de este dominio: `numeric(12,2)` llega como
 * máximo a 9.999.999.999,99, muy por debajo de `Number.MAX_SAFE_INTEGER`
 * (9.007.199.254.740.991) incluso contando los centavos.
 *
 * Lo que NO es seguro es hacer aritmética de dinero con estos números en coma
 * flotante (el clásico 0,1 + 0,2). El reparto precio → comisión + neto del
 * paso 13 del CU-006 se calcula en centavos enteros; ver `src/reventa/dinero.ts`.
 */
export const transformadorMonto: ValueTransformer = {
  to: (valor: number | null | undefined): number | null => valor ?? null,
  from: (valor: string | null): number | null => (valor === null ? null : Number(valor)),
};

/** Longitud de los códigos QR e identificadores legibles (`HXC-QR-...`, `TCK-...`). */
export const LARGO_CODIGO = 64;
