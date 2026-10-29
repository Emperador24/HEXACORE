import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { EstadoTransaccion, TransaccionReventa } from '../../persistencia/entidades/transaccion-reventa.entity';
import { ConexionRabbitMq } from './conexion-rabbitmq.service';
import { ConsumidorEntradaTransferida } from './consumidor-base';
import { EntradaTransferida } from './entrada-transferida.evento';
import { COLAS } from './topologia';

/**
 * Paso 13 del CU-006: *"Liquidar el pago correspondiente al vendedor"*.
 *
 * El abono real lo hace la pasarela (una transferencia al vendedor), y eso
 * queda fuera del alcance del prototipo. Lo que sí hace este consumidor es la
 * parte que no puede faltar: **comprobar contra la base de datos que la venta
 * existe y está aprobada antes de liquidar nada**.
 *
 * Esa comprobación no es ceremonia. Un evento de la cola es un mensaje que
 * llega por la red y que podría estar repetido, retrasado o —en el peor caso—
 * fabricado. Pagarle a alguien basándose solo en lo que dice el mensaje sería
 * confiar en el mensajero; consultar la transacción por su id convierte al
 * evento en un *aviso de que hay trabajo*, no en la fuente de la verdad.
 *
 * Es también la razón de que la comisión se recalcule desde la base y no se
 * tome del evento.
 */
@Injectable()
export class ConsumidorLiquidaciones extends ConsumidorEntradaTransferida {
  protected readonly log = new Logger(ConsumidorLiquidaciones.name);
  protected readonly cola = COLAS.liquidaciones;

  constructor(
    conexion: ConexionRabbitMq,
    @InjectDataSource() private readonly fuenteDatos: DataSource,
  ) {
    super(conexion);
  }

  protected async procesar(evento: EntradaTransferida): Promise<void> {
    const { transaccionId, numeroTransaccion, vendedorId } = evento.transferencia;

    const transaccion = await this.fuenteDatos.manager.findOneBy(TransaccionReventa, { id: transaccionId });

    if (!transaccion) {
      // No existe: o el evento es espurio, o llegó antes de que la transacción
      // fuera visible. Se lanza para que la base reintente; si sigue sin
      // aparecer tras tres intentos acabará en la DLQ, que es donde debe
      // mirarse algo así.
      throw new Error(`No existe la transacción ${transaccionId}`);
    }

    if (transaccion.estado !== EstadoTransaccion.APROBADA) {
      // Aquí NO se lanza: reintentar no va a cambiar el estado de una
      // transacción rechazada, y liquidar una venta que no se cobró sería
      // regalar dinero. Se registra y se da por procesado.
      this.log.error(
        `No se liquida ${numeroTransaccion}: la transacción está ${transaccion.estado}, no APROBADA`,
      );
      return;
    }

    if (!transaccion.referenciaPasarela) {
      this.log.error(`No se liquida ${numeroTransaccion}: no tiene referencia de pasarela con la que conciliar`);
      return;
    }

    // Las cifras se leen de la base, no del evento: es lo que la restricción
    // CHECK del esquema garantiza que cuadra al centavo.
    this.log.log(
      `[liquidación ${numeroTransaccion}] abonar ${transaccion.netoVendedor} al vendedor ` +
        `${vendedorId.slice(0, 8)} · comisión retenida ${transaccion.comision} ` +
        `· referencia ${transaccion.referenciaPasarela}`,
    );

    // Cuando exista el abono real, va aquí. Si la pasarela falla, basta con
    // lanzar: la base reintenta y, si no hay manera, el evento queda en la DLQ
    // sin perderse (ASR-07, RNF-11).
  }
}
