import {
  ForbiddenException,
  HttpException,
  Inject,
  Injectable,
  Logger,
  ParseUUIDPipe,
  ValidationPipe,
} from '@nestjs/common';
import { ExecutionContextHost } from '@nestjs/core/helpers/execution-context-host';
import {
  CONFIGURACION,
  ConfiguracionServicio,
} from '../../config/configuracion';
import { ApiVentas } from '../../api-ventas';
import { EntradasInternasService } from './entradas-internas.service';
import { EntradasInternasController } from './entradas-internas.controller';
import { LlamadaInterna } from './llamada-interna.guard';
import {
  EntradaIdDto,
  MarcarEnReventaDto,
  TransferirDto,
} from './dto/interno.dto';

/** Adaptador local del contrato interno; reutiliza guard, DTO y respuestas existentes. */
@Injectable()
export class ApiVentasLocal implements ApiVentas {
  private readonly log = new Logger(ApiVentasLocal.name);
  private readonly controller: EntradasInternasController;
  private readonly validacion = new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: { enableImplicitConversion: false },
  });
  constructor(
    entradas: EntradasInternasService,
    private readonly guard: LlamadaInterna,
    @Inject(CONFIGURACION) private readonly config: ConfiguracionServicio,
  ) {
    this.controller = new EntradasInternasController(entradas);
  }
  async enviar<T>(
    ruta: string,
    token: string,
    cuerpo?: object,
  ): Promise<{ estadoHttp: number | null; cuerpo: T | null }> {
    try {
      // El adaptador es del servidor; el actor ya se autorizó en Postventa.
      const headers = { 'x-token-servicio': this.config.tokenServicios };
      const contexto = new ExecutionContextHost(
        [{ headers }],
        EntradasInternasController,
        this.controller.entradasDe,
      );
      if (!(await this.guard.canActivate(contexto)))
        throw new ForbiddenException();
      let resultado: unknown;
      if (ruta.startsWith('/interno/entradas/de/')) {
        const id = await new ParseUUIDPipe().transform(
          ruta.slice('/interno/entradas/de/'.length),
          { type: 'param' },
        );
        resultado = await this.controller.entradasDe(id);
      } else {
        const metatype = ruta.endsWith('/marcar-en-reventa')
          ? MarcarEnReventaDto
          : ruta.endsWith('/transferir')
            ? TransferirDto
            : EntradaIdDto;
        const dto = await this.validacion.transform(cuerpo, {
          type: 'body',
          metatype,
        });
        if (ruta.endsWith('/marcar-en-reventa'))
          resultado = await this.controller.marcarEnReventa(dto);
        else if (ruta.endsWith('/devolver-de-reventa'))
          resultado = await this.controller.devolverDeReventa(dto);
        else if (ruta.endsWith('/transferir'))
          resultado = await this.controller.transferir(dto);
        else return { estadoHttp: 404, cuerpo: null };
      }
      return { estadoHttp: 200, cuerpo: resultado as T };
    } catch (error) {
      if (error instanceof HttpException)
        return {
          estadoHttp: error.getStatus(),
          cuerpo: error.getResponse() as T,
        };
      this.log.error(error instanceof Error ? error.stack : String(error));
      return {
        estadoHttp: 500,
        cuerpo: { statusCode: 500, message: 'Internal server error' } as T,
      };
    }
  }
}
