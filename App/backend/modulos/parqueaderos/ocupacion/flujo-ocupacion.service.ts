import { ForbiddenException, Injectable, MessageEvent, OnModuleDestroy, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { Observable, Subject, catchError, concatMap, defer, exhaustMap, map, of, takeUntil, timeout, timer } from 'rxjs';
import { AccesoRequerido, SesionValida } from '../comun/autenticacion/sesion-valida.guard';
import { OcupacionService } from './ocupacion.service';

/** RNF-09: un ingreso o una salida se ve en el panel en ≤ 2 s; con 1 s, la espera más larga es 1 s más la consulta. */
export const INTERVALO_OCUPACION_MS = 1000;
/** Acota la espera completa del panel; sus consultas de parqueaderos tienen además límite SQL de 2 s. */
export const ESPERA_PANEL_MS = 5000;

@Injectable()
export class FlujoOcupacionService implements OnModuleDestroy {
  private readonly cierre = new Subject<void>();

  constructor(private readonly sesiones: SesionValida, private readonly ocupacion: OcupacionService) {}

  /** Con `acceso`, el flujo también se corta si la sesión pierde el rol o el permiso (CU-028B). */
  seguir(eventoId: string, token: string, acceso?: AccesoRequerido): Observable<MessageEvent> {
    return defer(() => {
      // Una verificación por conexión a la vez; el control periódico y el
      // previo a emitir comparten la que ya esté en curso (Redis: máximo 2 s).
      let pendiente: ReturnType<SesionValida['validar']> | undefined;
      const validar = () => pendiente ??= this.sesiones.validar(token, acceso).finally(() => { pendiente = undefined; });
      return timer(0, INTERVALO_OCUPACION_MS).pipe(
        exhaustMap(() => defer(validar)),
        // La seguridad sigue comprobándose aunque un panel esté pendiente.
        // El error del origen desuscribe el panel y descarta su resultado tardío.
        exhaustMap(() => defer(() => this.ocupacion.panelParaFlujo(eventoId)).pipe(
          timeout(ESPERA_PANEL_MS),
          concatMap(datos => defer(validar).pipe(map((): MessageEvent => ({ type: 'ocupacion', data: datos })))),
        )),
        catchError(error => of<MessageEvent>({ type: 'sesion_finalizada', data: {
          codigo: error instanceof UnauthorizedException ? 'SIN_AUTENTICAR'
            : error instanceof ForbiddenException ? 'ROL_INSUFICIENTE'
            : error instanceof ServiceUnavailableException ? 'SESIONES_NO_DISPONIBLES' : 'FLUJO_NO_DISPONIBLE',
          mensaje: error instanceof UnauthorizedException ? 'Tu sesión terminó. Inicia sesión de nuevo.'
            : error instanceof ForbiddenException ? 'Ya no tienes permiso para ver este panel.'
            : 'No se puede mantener el flujo en este momento. Vuelve a intentarlo.',
        } })),
        takeUntil(this.cierre),
      );
    });
  }

  onModuleDestroy(): void {
    this.cierre.next();
    this.cierre.complete();
  }
}
