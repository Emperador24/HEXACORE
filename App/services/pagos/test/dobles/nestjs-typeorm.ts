/**
 * Doble de `@nestjs/typeorm` para las pruebas unitarias.
 *
 * Ese paquete se publica como ESM (`"type": "module"`), y Jest no puede
 * cargarlo con `require` desde un test CommonJS: falla con
 * `createRequireEsmError` en cuanto un servicio lo importa. Sustituirlo no
 * pierde nada: `@InjectDataSource()` solo deja metadatos para el contenedor de
 * inyección de Nest, y estas pruebas instancian los servicios con `new`,
 * pasándoles los dobles a mano.
 *
 * Es el mismo doble que ya usaba `entradas-mercado-secundario`; se repite aquí
 * porque cada servicio tiene su propio `node_modules` y su propia
 * configuración de Jest (ADR-01: los servicios no comparten código).
 *
 * El cableado real —que el decorador inyecte de verdad el `DataSource`— lo
 * ejercitan las pruebas de integración, que arrancan la aplicación entera.
 */
export const InjectDataSource = () => () => undefined;
export const InjectRepository = () => () => undefined;
export const getRepositoryToken = (entidad: unknown) => entidad;
/**
 * `TypeOrmModule` necesita sus métodos estáticos porque algunas pruebas
 * importan el módulo de Nest que los llama (`persistencia.module.ts` hace
 * `forRootAsync`). Devuelven un módulo dinámico vacío: la prueba no levanta
 * el contenedor, solo necesita que la evaluación del decorador no reviente.
 */
export class TypeOrmModule {
  static forRoot() {
    return { module: TypeOrmModule, providers: [], exports: [] };
  }

  static forRootAsync() {
    return { module: TypeOrmModule, providers: [], exports: [] };
  }

  static forFeature() {
    return { module: TypeOrmModule, providers: [], exports: [] };
  }
}
