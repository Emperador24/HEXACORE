import { ValidationPipe } from '@nestjs/common';

// La validación antes aplicada por el servidor HTTP sigue en la frontera local.
const validacion = new ValidationPipe({
  whitelist: true, forbidNonWhitelisted: true, transform: true,
  transformOptions: { enableImplicitConversion: false },
});

export async function validarSolicitudPagos<T extends object>(tipo: new () => T, valor: unknown): Promise<T> {
  return validacion.transform(valor, { type: 'body', metatype: tipo });
}
