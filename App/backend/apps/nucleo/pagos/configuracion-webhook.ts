export const CONFIGURACION = 'CONFIGURACION_WEBHOOK_PAGOS_NUCLEO';
export function cargarConfiguracionWebhook() {
  const secreto = process.env.PASARELA_SECRETO_WEBHOOK?.trim();
  if (process.env.NODE_ENV === 'production' && !secreto) {
    throw new Error('Falta la variable de entorno PASARELA_SECRETO_WEBHOOK');
  }
  return { pasarelaPagos: { secretoWebhook: secreto || 'secreto-webhook-desarrollo' } };
}
export type ConfiguracionServicio = ReturnType<typeof cargarConfiguracionWebhook>;
