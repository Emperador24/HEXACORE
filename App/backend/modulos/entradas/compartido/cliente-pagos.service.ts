import { HttpException, Injectable } from '@nestjs/common';
import { CobrarDto, PagosService, ReembolsarDto, validarSolicitudPagos } from '../../finanzas/pagos';
import { ProcesadorPagos, RespuestaCobro, ResultadoCobro, SolicitudCobro, SolicitudReembolso } from './procesador-pagos';

/** Adaptador local: conserva el contrato del dominio y la autorización de sus controladores. */
@Injectable()
export class ClientePagos implements ProcesadorPagos {
  constructor(private readonly pagos: PagosService) {}

  async cobrar(solicitud: SolicitudCobro, tokenSesion: string): Promise<RespuestaCobro> {
    return this.enviar('/pagos', tokenSesion, {
      claveIdempotencia: solicitud.claveIdempotencia, solicitante: 'entradas',
      monto: solicitud.monto, moneda: solicitud.moneda, token: solicitud.token,
      descripcion: solicitud.descripcion,
    });
  }
  async reembolsar(solicitud: SolicitudReembolso, tokenSesion: string): Promise<RespuestaCobro> {
    return this.enviar('/pagos/reembolsos', tokenSesion, {
      claveIdempotencia: solicitud.claveIdempotencia, solicitante: 'entradas',
      referenciaCobro: solicitud.referenciaCobro, monto: solicitud.monto,
      moneda: solicitud.moneda, motivo: solicitud.motivo,
    });
  }
  private async enviar(ruta: string, _tokenSesion: string, cuerpo: object): Promise<RespuestaCobro> {
    const indeterminado = (motivo: string): RespuestaCobro => ({ resultado: ResultadoCobro.INDETERMINADO, referencia: null, motivo });
    try {
      const datos = ruta === '/pagos'
        ? await this.pagos.cobrar(await validarSolicitudPagos(CobrarDto, cuerpo))
        : await this.pagos.reembolsar(await validarSolicitudPagos(ReembolsarDto, cuerpo));
      const resultado = datos.resultado;
      if (resultado !== ResultadoCobro.APROBADO && resultado !== ResultadoCobro.RECHAZADO && resultado !== ResultadoCobro.INDETERMINADO) {
        return indeterminado('PAGOS_RESPUESTA_INVALIDA');
      }
      return { resultado, referencia: typeof datos.referencia === 'string' ? datos.referencia : null,
        motivo: typeof datos.motivo === 'string' ? datos.motivo : null };
    } catch (error) {
      if (error instanceof HttpException && error.getStatus() === 409) {
        return { resultado: ResultadoCobro.RECHAZADO, referencia: null, motivo: 'CLAVE_IDEMPOTENCIA_INCOMPATIBLE' };
      }
      return indeterminado('PAGOS_ERROR_HTTP');
    }
  }
}
