import { sinErroresEsperados } from '../../test/logistica/errores-esperados';

describe('Errores intencionales del arnés de integración', () => {
  const patron = /^ERROR \[SesionValida\] roles ilegibles$/;
  const linea = 'ERROR [SesionValida] roles ilegibles';

  it('acredita exactamente las dos líneas declaradas y conserva el texto original', () => {
    const salida = `inicio\n${linea}\n${linea}\nfin\n`;
    expect(sinErroresEsperados(salida, [{ desde: 7, hasta: salida.indexOf('fin'), patron, cantidad: 2 }])).toBe('inicio\n\n\nfin\n');
    expect(salida).toContain(linea);
  });

  it('otro ERROR dentro de la ventana y errores fuera de ella siguen siendo inesperados', () => {
    const salida = `${linea}\nERROR conexión inesperada\n${linea}\n`;
    const desde = salida.lastIndexOf(linea);
    const restante = sinErroresEsperados(salida, [{ desde, hasta: salida.length, patron, cantidad: 1 }]);
    expect(restante).toContain(linea);
    expect(restante).toContain('ERROR conexión inesperada');
  });

  it.each([0, 1, 3])('rechaza una cantidad %i distinta de los dos errores exigidos', (cantidad) => {
    const salida = Array(cantidad).fill(linea).join('\n');
    expect(() => sinErroresEsperados(salida, [{ desde: 0, hasta: salida.length, patron, cantidad: 2 }])).toThrow(/Cantidad exacta/);
  });
});
