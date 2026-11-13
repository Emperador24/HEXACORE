import 'reflect-metadata';
import { CheckoutDto } from './checkout.dto';
import { MercadoDto, PublicacionMercadoDto } from './mercado.dto';
import { ResultadoCompraDto } from './pagar.dto';
import { EntradaPropiaDto, PublicacionDto } from './publicacion.dto';

/**
 * Las respuestas de CU-006 son el contrato con el portal y la app (RNF-14:
 * el cliente no recalcula reglas). Cada campo que devuelve el servicio debe
 * estar documentado en OpenAPI; si alguien añade uno sin `@ApiProperty`, el
 * contrato publicado miente.
 */
describe('Respuestas de reventa documentadas en OpenAPI', () => {
  const documentados = (clase: new () => object) =>
    ((Reflect.getMetadata('swagger/apiModelPropertiesArray', clase.prototype) ?? []) as string[]).map((p) => p.replace(/^:/, ''));

  it.each([
    [PublicacionMercadoDto, ['id', 'precio', 'precioOriginal', 'estado', 'fechaExpiracion', 'esPropia']],
    [MercadoDto, ['publicaciones', 'total']],
    [CheckoutDto, ['id', 'publicacion', 'segundosRestantes']],
    [ResultadoCompraDto, ['entradaId', 'codigoQr', 'transferida']],
    [PublicacionDto, ['id', 'entradaId', 'precio', 'estado']],
    [EntradaPropiaDto, ['id', 'puedePublicarse', 'precioMaximo']],
  ] as [new () => object, string[]][])('%p documenta sus campos', (Clase, campos) => {
    expect(new Clase()).toBeInstanceOf(Clase);
    expect(documentados(Clase)).toEqual(expect.arrayContaining(campos));
  });
});
