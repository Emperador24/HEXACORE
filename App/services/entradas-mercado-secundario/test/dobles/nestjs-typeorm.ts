/**
 * Doble de `@nestjs/typeorm` para las pruebas unitarias.
 *
 * Ese paquete se publica como ESM (`"type": "module"`), y Jest no puede
 * cargarlo con `require` desde un test CommonJS. Sustituirlo no pierde nada:
 * `@InjectDataSource()` solo deja metadatos para el contenedor de inyección de
 * Nest, y estas pruebas instancian los servicios con `new`, pasándoles los
 * dobles a mano.
 *
 * Lo que de verdad se prueba —la lógica del servicio— es idéntico con o sin el
 * decorador. El cableado real lo ejercitan las pruebas de `pruebas/`, que
 * arrancan la aplicación entera.
 */
export const InjectDataSource = () => () => undefined;
export const InjectRepository = () => () => undefined;
export const getRepositoryToken = (entidad: unknown) => entidad;
export class TypeOrmModule {}
