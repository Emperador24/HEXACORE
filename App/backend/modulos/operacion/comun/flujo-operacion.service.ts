import { ForbiddenException, Injectable, MessageEvent, OnModuleDestroy, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { EMPTY, Observable, Subject, catchError, concatMap, defer, exhaustMap, map, of, takeUntil, timeout, timer } from 'rxjs';
import { AccesoRequerido, SesionValida } from '../../../compartido/seguridad/sesion-valida.guard';

export const ESPERA_ESTADO_MS = 5000;

/** Patrón de Parqueaderos: misma sesión/permiso vigente durante ambos flujos de Operación. */
@Injectable()
export class FlujoOperacionService implements OnModuleDestroy {
  private readonly cierre = new Subject<void>();
  private cerrado = false;

  constructor(private readonly sesiones: SesionValida) {}

  seguir(consultar: () => Promise<object>, token: string, acceso: AccesoRequerido, intervalo: number, tipo: 'evacuacion' | 'panel'): Observable<MessageEvent> {
    return defer(() => {
      if (this.cerrado) return EMPTY;
      let pendiente: ReturnType<SesionValida['validar']> | undefined;
      const validar = () => pendiente ??= this.sesiones.validar(token, acceso).finally(() => { pendiente = undefined; });
      return timer(0, intervalo).pipe(
        exhaustMap(() => defer(validar)),
        // La comprobación continúa aunque una consulta esté pendiente. No se
        // apilan paneles ni validaciones; invalidar descarta resultados tardíos.
        exhaustMap(() => defer(consultar).pipe(
          timeout(ESPERA_ESTADO_MS),
          concatMap(datos => defer(validar).pipe(map((): MessageEvent => ({ type: tipo, data: datos })))),
        )),
        catchError(error => of<MessageEvent>({ type: 'sesion_finalizada', data: {
          codigo: error instanceof UnauthorizedException ? 'SIN_AUTENTICAR'
            : error instanceof ForbiddenException ? 'ROL_INSUFICIENTE'
            : error instanceof ServiceUnavailableException ? 'SESIONES_NO_DISPONIBLES' : 'FLUJO_NO_DISPONIBLE',
          mensaje: error instanceof UnauthorizedException ? 'Tu sesión terminó. Inicia sesión de nuevo.'
            : error instanceof ForbiddenException ? 'Ya no tienes permiso para ver este estado.'
            : 'No se puede mantener el flujo en este momento. Vuelve a intentarlo.',
        } })),
        takeUntil(this.cierre),
      );
    });
  }

  onModuleDestroy(): void {
    this.cerrado = true;
    this.cierre.next();
    this.cierre.complete();
  }
}
