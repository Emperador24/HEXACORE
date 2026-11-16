import { ValidationPipe } from '@nestjs/common';

const opciones = {
  whitelist: true, forbidNonWhitelisted: true, transform: true,
  transformOptions: { enableImplicitConversion: false },
};

// Conserva el contrato anterior: Identidad entrega un error por campo;
// Alimentos conserva todos los validadores. Se aplican a cada controlador.
export const validacionIdentidad = new ValidationPipe({ ...opciones, stopAtFirstError: true });
export const validacionAlimentos = new ValidationPipe(opciones);

// Logística conserva whitelist/transform, aceptando campos extra como antes.
export const validacionLogistica = new ValidationPipe({ whitelist: true, transform: true });
