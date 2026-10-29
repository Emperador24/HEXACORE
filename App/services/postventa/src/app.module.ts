import { Module } from '@nestjs/common';
import { ConfigModule } from './config/config.module';
import { PersistenciaModule } from './persistencia/persistencia.module';
import { ReventaModule } from './postventa/reventa.module';
import { SaludController } from './salud/salud.controller';

/**
 * Microservicio de Postventa (ADR-14): CU-006, el mercado secundario.
 *
 * Salió de `entradas-mercado-secundario` en la fase A. Cumple tres de los
 * cuatro criterios de extracción del ADR-14:
 *
 * - **Pico propio y en otro momento.** La reventa se mueve en los días
 *   anteriores al evento, cuando la venta primaria ya se agotó.
 * - **Almacén propio.** Publicaciones y transacciones de reventa no las
 *   consulta nadie más.
 * - **Falla aislada.** Si el mercado secundario se cae, la venta primaria y la
 *   entrada a la puerta siguen funcionando. Antes compartían proceso: un
 *   checkout de reventa atascado consumía los hilos de todo lo demás.
 *
 * Lo que **no** se llevó es `Entrada`: es de Ventas. Postventa orquesta la
 * reventa a través de su API interna, y eso convirtió la transacción que antes
 * publicaba y transfería en dos Sagas con compensación.
 */
@Module({
  imports: [ConfigModule, PersistenciaModule, ReventaModule],
  controllers: [SaludController],
})
export class AppModule {}
