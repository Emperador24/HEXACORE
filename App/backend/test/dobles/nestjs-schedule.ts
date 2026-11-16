/**
 * Doble de `@nestjs/schedule` para las pruebas unitarias. Mismo motivo que
 * `nestjs-typeorm.ts`: el paquete es ESM y Jest no puede requerirlo.
 *
 * `@Cron` solo registra el método en el planificador de Nest; el método en sí
 * se puede llamar directamente, que es lo que hace la prueba de `barrer()`. El
 * temporizador de verdad se comprobó arrancando el servicio con un intervalo
 * corto (ver README, paso 8).
 */
export const Cron = (..._args: unknown[]) => () => undefined;
export const Interval = (..._args: unknown[]) => () => undefined;
export const CronExpression = {
  EVERY_10_MINUTES: '0 */10 * * * *',
  EVERY_MINUTE: '0 * * * * *',
};
export class ScheduleModule {
  static forRoot() {
    return {};
  }
}
