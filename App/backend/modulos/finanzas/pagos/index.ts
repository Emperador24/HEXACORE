/** API pública: operaciones existentes y sus contratos; sin controladores HTTP. */
export { PagosModule } from './pagos.module';
export { PagosService } from './pagos.service';
export { CobrarDto, ReembolsarDto, RespuestaPagoDto } from './dto/pagos.dto';
export { NotificacionPasarelaDto } from './dto/webhook.dto';
export { ResultadoCobro } from './procesador-pagos';
export type { EventoPago, TipoEventoPago } from './contratos/evento-pago';
export { TipoOperacion } from './contratos/tipo-operacion';
export { validarSolicitudPagos } from './dto/validar-solicitud';
