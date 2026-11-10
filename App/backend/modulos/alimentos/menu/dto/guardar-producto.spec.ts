import { ValidationPipe } from '@nestjs/common';
import { RegistrarProductoDto, AjustarInventarioDto, precioNormalizado } from './guardar-producto.dto';
const pipe = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true });
const producto = { nombre:' Hamburguesa ', precio:'1000.10', descripcion:'Con queso', restriccionesAlimentarias:[' leche '], activo:true, cantidadInicial:5 };
describe('CU-012A/B/C: validación de producto y existencias', () => {
  const validar = (datos: unknown) => pipe.transform(datos,{type:'body',metatype:RegistrarProductoDto});
  it('normaliza texto y conserva importes como decimal textual exacto', async () => {
    expect(await validar(producto)).toMatchObject({ nombre:'Hamburguesa', precio:'1000.10', restriccionesAlimentarias:['leche'] });
    expect(precioNormalizado('9999999999.99')).toBe('9999999999.99');
    expect(precioNormalizado('0.1')).toBe('0.10');
  });
  it.each([{nombre:' '},{precio:1.1},{precio:'1.001'},{precio:'NaN'},{precio:'1e3'},{precio:'-1'},
    {precio:'10000000000'},{cantidadInicial:-1},{cantidadInicial:1.5},{cantidadInicial:'5'},
    {cantidadInicial:2147483648},{cantidadInicial:null},{restriccionesAlimentarias:[' ']},
    {restriccionesAlimentarias:['leche','leche']},{restriccionesAlimentarias:'leche'},
    {activo:'true'},{inventarioFisico:100},{establecimientoId:'intruso'}])('rechaza %j', async cambio => {
    await expect(validar({...producto,...cambio})).rejects.toMatchObject({status:400});
  });
  it.each([0,-2147483648,2147483648,1.5,'1',null])('rechaza delta inválido %s', async delta => {
    await expect(pipe.transform({delta,motivo:'Reposición'},{type:'body',metatype:AjustarInventarioDto})).rejects.toMatchObject({status:400});
  });
});
