import { Module } from '@nestjs/common';
import { ConfigModule } from './comun/config/config.module';
import { AdministracionModule } from './modulos/administracion/administracion.module';

/**
 * Núcleo — servicio de dominio agregado (ADR-12).
 *
 * Una sola unidad desplegable que agrupa varios dominios como **módulos**, en
 * lugar de un microservicio por dominio. Cada módulo conserva su esquema de
 * datos, su `data-source` y su propia secuencia de migraciones, de modo que un
 * cambio de esquema en uno sigue sin tocar a los demás.
 *
 * Módulos previstos (ADR-12):
 *   - Administración — CU-027..032 · ya migrado
 *   - Pedidos        — CU-011..015 · tarjeta 05
 *   - Personal       — CU-007..009 · sin implementar
 *   - Parqueaderos   — CU-021..025 · sin implementar
 *
 * Lo que vive en `comun/` es lo que comparten todos: la configuración del
 * proceso, el pool de hilos y el filtro de base no disponible. Un módulo puede
 * usar `comun/`; `comun/` nunca depende de un módulo.
 *
 * Los dominios que sí salieron aparte como servicios replicables —Entradas /
 * Mercado Secundario y Eventos / Emergencias— no están aquí: cumplen un
 * criterio de extracción y siguen siendo despliegues independientes.
 */
@Module({
  imports: [ConfigModule, AdministracionModule],
})
export class AppModule {}
