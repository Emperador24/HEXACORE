import 'reflect-metadata';
import { Controller, Get, Module, Param } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';

/**
 * Candidato NestJS del PoC-04.
 *
 * Expone el mismo endpoint que el candidato Spring Boot, con la misma
 * respuesta y las mismas dos variantes:
 *   /entradas/:id/disponibilidad        -> responde de inmediato (overhead puro del framework)
 *   /entradas/:id/disponibilidad-io     -> espera 2 ms antes de responder (simula la BD en red)
 *
 * La segunda variante existe por la lección del PoC-02: medir sin latencia de
 * I/O exagera la diferencia entre frameworks, porque en producción el tiempo
 * lo domina la base de datos, no el framework.
 */

const ESPERA_IO_MS = 2;

function respuesta(id: string) {
  return {
    eventoId: id,
    disponibles: 1250,
    zonas: [
      { nombre: 'General', precio: 180000, disponibles: 800 },
      { nombre: 'Platea Baja', precio: 260000, disponibles: 350 },
      { nombre: 'Palco VIP', precio: 420000, disponibles: 100 }
    ]
  };
}

@Controller('entradas')
class EntradasController {
  @Get(':id/disponibilidad')
  disponibilidad(@Param('id') id: string) {
    return respuesta(id);
  }

  @Get(':id/disponibilidad-io')
  async disponibilidadConIo(@Param('id') id: string) {
    await new Promise((r) => setTimeout(r, ESPERA_IO_MS));
    return respuesta(id);
  }
}

@Module({ controllers: [EntradasController] })
class AppModule {}

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { logger: false });
  await app.listen(3001);
}
bootstrap();
