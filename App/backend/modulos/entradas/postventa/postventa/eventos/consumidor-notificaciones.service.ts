import { Injectable, Logger } from '@nestjs/common';
import { ConexionRabbitMq } from './conexion-rabbitmq.service';
import { ConsumidorEntradaTransferida } from './consumidor-base';
import { EntradaTransferida } from './entrada-transferida.evento';
import { COLAS } from './topologia';

/**
 * Paso 12 del CU-006: *"Notificar al comprador y al vendedor sobre la
 * transacción"*.
 *
 * El envío real lo hace el **Proveedor de Notificaciones**, que en el SAD es un
 * sistema externo (push, correo y SMS, según la vista de contenedores). Este
 * consumidor es quien lo dispararía; por ahora deja el registro de lo que se
 * enviaría, porque integrar un proveedor de correo no aporta nada al CU-006 y
 * añadiría credenciales al prototipo.
 *
 * Lo que sí está completo es **la parte arquitectónica**, que es la que el caso
 * de uso pone a prueba: que la notificación viaja por la cola y no en el camino
 * de respuesta. El diagrama de secuencia lo dice con todas las letras —
 * *"Publicar y notificar es asíncrono, fuera del camino de respuesta"*, y *"el
 * mismo evento notifica a comprador y vendedor"*.
 */
@Injectable()
export class ConsumidorNotificaciones extends ConsumidorEntradaTransferida {
  protected readonly log = new Logger(ConsumidorNotificaciones.name);
  protected readonly cola = COLAS.notificaciones;

  constructor(conexion: ConexionRabbitMq) {
    super(conexion);
  }

  protected async procesar(evento: EntradaTransferida): Promise<void> {
    const { entrada, transferencia, importes } = evento;

    // Al comprador: la confirmación y su código de ingreso nuevo, que son las
    // dos SALIDAS que declara el CU-006.
    this.log.log(
      `[comprador ${transferencia.compradorId.slice(0, 8)}] ` +
        `Compraste ${entrada.eventoNombre} (${entrada.localidadNombre}). ` +
        `Tu código de ingreso es ${entrada.codigoQrNuevo} · ${transferencia.numeroTransaccion}`,
    );

    // Al vendedor: que se vendió y cuánto va a recibir. El neto y no el precio:
    // es lo que de verdad le van a abonar tras la comisión.
    this.log.log(
      `[vendedor ${transferencia.vendedorId.slice(0, 8)}] ` +
        `Se vendió tu entrada ${entrada.numeroTicket} de ${entrada.eventoNombre}. ` +
        `Recibirás ${importes.netoVendedor} ${importes.moneda} ` +
        `(precio ${importes.precio} menos ${importes.comision} de comisión)`,
    );

    // Nota para quien conecte el proveedor real: si su API falla, basta con
    // lanzar aquí. La base se encarga de reintentar hasta tres veces y de
    // mandarlo a la DLQ si no hay manera, sin perderlo en silencio (ASR-07).
    await Promise.resolve();
  }
}
