import { VERSION_ENTRADA_TRANSFERIDA } from './topologia';

/**
 * Carga del evento `ENTRADA_TRANSFERIDA`.
 *
 * El contrato canónico es
 * `App/shared/eventos/entrada-transferida.schema.json`; esta interfaz es su
 * versión en TypeScript. Los dos tienen que moverse juntos — el JSON Schema
 * existe porque los consumidores pueden estar escritos en otro lenguaje, tal
 * como advierte el README de `shared/`.
 */
export interface EntradaTransferida {
  evento: 'ENTRADA_TRANSFERIDA';
  version: typeof VERSION_ENTRADA_TRANSFERIDA;
  /**
   * Id del evento. **Es el id de la transacción**, y esa igualdad es
   * deliberada: RabbitMQ entrega *al menos una vez*, así que un consumidor
   * puede ver el mismo evento dos veces (por ejemplo, si confirmó el mensaje
   * justo cuando se cayó la conexión). Darle una clave estable es lo que le
   * permite descartar el repetido en lugar de enviar dos correos o pagar dos
   * veces al vendedor.
   */
  id: string;
  ocurridoEn: string;
  entrada: {
    id: string;
    numeroTicket: string;
    eventoId: string;
    eventoNombre: string;
    localidadNombre: string;
    /** El código nuevo. El anterior no viaja: quien notifica no lo necesita. */
    codigoQrNuevo: string;
  };
  transferencia: {
    vendedorId: string;
    compradorId: string;
    publicacionId: string;
    transaccionId: string;
    numeroTransaccion: string;
  };
  importes: {
    precio: number;
    comision: number;
    netoVendedor: number;
    moneda: string;
    /** Referencia opaca del cobro. Nunca datos de tarjeta (RNF-05). */
    referenciaPasarela: string;
  };
}
