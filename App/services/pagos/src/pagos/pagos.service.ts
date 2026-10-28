import { ConflictException, Inject, Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { TipoOperacion, TransaccionPago } from '../persistencia/entidades/transaccion-pago.entity';
import { CobrarDto, ReembolsarDto, RespuestaPagoDto } from './dto/pagos.dto';
import { PROCESADOR_PAGOS, ProcesadorPagos, RespuestaCobro, ResultadoCobro } from './procesador-pagos';

@Injectable()
export class PagosService {
  private readonly log = new Logger(PagosService.name);

  constructor(
    @InjectDataSource() private readonly datos: DataSource,
    @Inject(PROCESADOR_PAGOS) private readonly pasarela: ProcesadorPagos,
  ) {}

  async cobrar(dto: CobrarDto): Promise<RespuestaPagoDto> {
    return this.operar(TipoOperacion.COBRO, dto.claveIdempotencia, dto.solicitante, dto.monto, dto.moneda, () =>
      this.pasarela.cobrar({
        monto: dto.monto,
        moneda: dto.moneda,
        token: dto.token,
        descripcion: dto.descripcion,
        claveIdempotencia: dto.claveIdempotencia,
      }),
    );
  }

  async reembolsar(dto: ReembolsarDto): Promise<RespuestaPagoDto> {
    return this.operar(TipoOperacion.REEMBOLSO, dto.claveIdempotencia, dto.solicitante, dto.monto, dto.moneda, () =>
      this.pasarela.reembolsar({
        referenciaCobro: dto.referenciaCobro,
        monto: dto.monto,
        moneda: dto.moneda,
        motivo: dto.motivo,
        claveIdempotencia: dto.claveIdempotencia,
      }),
    );
  }

  /**
   * El corazón del servicio: una operación por clave, pase lo que pase.
   *
   * ## Qué se guarda y qué se reintenta
   *
   * **APROBADO y RECHAZADO son finales.** Son respuestas de la pasarela: se
   * sabe con certeza qué pasó con el dinero. Un reintento con la misma clave
   * devuelve lo guardado sin volver a salir a la red. Es lo que hace seguro
   * que el comprador pulse dos veces o que un `webhook` llegue repetido.
   *
   * **INDETERMINADO no se congela.** Significa "no se sabe": timeout, red
   * caída, la pasarela sin responder. Guardar eso como final sería convertir
   * una duda en un hecho para siempre. Un reintento vuelve a preguntar **con
   * la misma clave**, que es justo lo que la pasarela necesita para devolver
   * el resultado del primer intento si llegó a haber cobro. Así la duda se
   * resuelve en vez de quedarse.
   *
   * Lo que sí queda escrito es el intento, con su contador: una fila
   * INDETERMINADO con muchos intentos es la que hay que mirar a mano, y es la
   * cola de reconciliación que pide el SAD §13.
   */
  private async operar(
    tipo: TipoOperacion,
    clave: string,
    solicitante: string,
    monto: number,
    moneda: string,
    llamarPasarela: () => Promise<RespuestaCobro>,
  ): Promise<RespuestaPagoDto> {
    const repositorio = this.datos.getRepository(TransaccionPago);
    const previa = await repositorio.findOne({ where: { claveIdempotencia: clave } });

    if (previa) {
      // Misma clave para otra operación: es un error de quien llama, no un
      // reintento. Cobrar aquí mezclaría dos operaciones bajo una sola llave.
      if (previa.tipo !== tipo || Number(previa.monto) !== monto || previa.moneda !== moneda) {
        throw new ConflictException({ codigo: 'CLAVE_IDEMPOTENCIA_INCOMPATIBLE' });
      }
      if (previa.resultado !== ResultadoCobro.INDETERMINADO) {
        return {
          resultado: previa.resultado,
          referencia: previa.referencia,
          motivo: previa.motivo,
          repetida: true,
        };
      }
      this.log.warn(`Reintento de ${clave} (${previa.intentos} intentos previos, seguía INDETERMINADO)`);
    }

    const respuesta = await llamarPasarela();

    await repositorio.save({
      claveIdempotencia: clave,
      tipo,
      solicitante,
      monto: monto.toFixed(2),
      moneda,
      resultado: respuesta.resultado,
      referencia: respuesta.referencia,
      motivo: respuesta.motivo,
      intentos: (previa?.intentos ?? 0) + 1,
    });

    if (respuesta.resultado === ResultadoCobro.INDETERMINADO) {
      this.log.error(
        `SIN RESOLVER ${tipo} ${clave} de ${solicitante}: ${respuesta.motivo}. ` +
          'No se sabe si hubo movimiento de dinero; queda para reconciliación.',
      );
    }

    return {
      resultado: respuesta.resultado,
      referencia: respuesta.referencia,
      motivo: respuesta.motivo,
      repetida: false,
    };
  }
}
