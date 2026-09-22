import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from '../app.module';

/**
 * Exporta la especificación OpenAPI del servicio a `App/shared/api/`.
 *
 *   npm run contrato:api
 *
 * ## Por qué se genera y no se escribe a mano
 *
 * El README de `shared/` pide que los contratos entre servicios y frontends se
 * expresen como especificación de API, porque el portal (TypeScript) y el móvil
 * (Dart) no comparten lenguaje. Un archivo escrito a mano se queda obsoleto en
 * cuanto alguien añade un campo a un DTO, y entonces miente — que es peor que
 * no tenerlo. Generarlo desde los mismos decoradores que definen los endpoints
 * garantiza que describe lo que el servicio hace de verdad.
 *
 * Levanta la aplicación **sin escuchar en ningún puerto**: solo necesita el
 * árbol de módulos para leer los metadatos, no atender peticiones. Aun así
 * requiere que las dependencias existan, porque Nest construye los proveedores
 * al inicializar.
 */
async function exportar(): Promise<void> {
  const app = await NestFactory.create(AppModule, { logger: false });

  const documento = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('Entradas y Mercado Secundario')
      .setDescription(
        'Venta primaria (CU-001 compra, CU-002 validar QR, CU-003 cancelaciones, CU-004 promociones), ' +
          'CU-005 — Consultar evento (cartelera pública) y ' +
          'CU-006 — Gestión del Mercado Secundario de Entradas.\n\n' +
          'En producción este servicio se consume a través del API Gateway (ADR-02), que autentica ' +
          'y autoriza por rol antes de enrutar (RNF-06); nunca se expone directo. La cartelera es ' +
          'la única ruta que no exige sesión, y solo admite lectura.\n\n' +
          'Generado con `npm run contrato:api` desde el código del servicio: no editar a mano.',
      )
      .setVersion('0.1.0')
      .addBearerAuth()
      .build(),
  );

  const destino = join(__dirname, '../../../../shared/api/entradas-mercado-secundario.openapi.json');
  writeFileSync(destino, `${JSON.stringify(documento, null, 2)}\n`, 'utf8');

  const rutas = Object.keys(documento.paths).length;
  const esquemas = Object.keys(documento.components?.schemas ?? {}).length;
  console.log(`Escrito ${destino}`);
  console.log(`  ${rutas} rutas · ${esquemas} esquemas`);

  await app.close();
}

exportar().catch((error: unknown) => {
  console.error('No se pudo exportar el contrato:', error);
  process.exit(1);
});
