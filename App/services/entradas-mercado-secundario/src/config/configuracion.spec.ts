import { cargarConfiguracion } from './configuracion';

/**
 * La configuración se valida al arrancar para que un servicio mal configurado
 * se niegue a levantar, en vez de fallar más tarde en mitad de un checkout con
 * el pago ya cobrado. Estas pruebas fijan cada guarda.
 */
describe('cargarConfiguracion', () => {
  const entornoOriginal = process.env;

  beforeEach(() => {
    // Se parte de un entorno limpio: si la máquina que corre las pruebas
    // tuviera estas variables puestas, los resultados dependerían de ella.
    process.env = { NODE_ENV: 'test' };
  });

  afterAll(() => {
    process.env = entornoOriginal;
  });

  it('usa valores por defecto razonables sin ninguna variable', () => {
    const config = cargarConfiguracion();

    expect(config.reventa.topePrecioFactor).toBe(1.5);
    expect(config.reventa.comisionPorcentaje).toBe(10);
    expect(config.reventa.bloqueoTtlSegundos).toBe(120);
    expect(config.puerto).toBe(3001);
  });

  it('rechaza un NODE_ENV desconocido', () => {
    process.env.NODE_ENV = 'produccion';

    expect(() => cargarConfiguracion()).toThrow(/NODE_ENV inválido/);
  });

  describe('tope de precio', () => {
    it('rechaza un factor menor que 1', () => {
      // Haría irrevendible toda entrada: el mercado quedaría vacío por
      // configuración, sin que nadie entendiera por qué.
      process.env.REVENTA_TOPE_PRECIO_FACTOR = '0.8';

      expect(() => cargarConfiguracion()).toThrow(/debe ser >= 1/);
    });

    it('acepta un factor alto, para poder desactivar el tope', () => {
      process.env.REVENTA_TOPE_PRECIO_FACTOR = '999';

      expect(cargarConfiguracion().reventa.topePrecioFactor).toBe(999);
    });
  });

  describe('comisión', () => {
    it.each([['-1'], ['100'], ['150']])('rechaza un porcentaje fuera de rango (%s)', (valor) => {
      process.env.REVENTA_COMISION_PORCENTAJE = valor;

      expect(() => cargarConfiguracion()).toThrow(/debe estar en \[0, 100\)/);
    });

    it('acepta cero, para un mercado sin comisión', () => {
      process.env.REVENTA_COMISION_PORCENTAJE = '0';

      expect(cargarConfiguracion().reventa.comisionPorcentaje).toBe(0);
    });
  });

  describe('TTL del bloqueo frente al timeout de la pasarela', () => {
    it('rechaza un TTL que no supere el timeout de la pasarela', () => {
      // Es la guarda que protege RNF-01: si el bloqueo caduca con el cobro en
      // vuelo, la publicación queda libre y puede venderse dos veces.
      process.env.REVENTA_BLOQUEO_TTL_SEGUNDOS = '5';
      process.env.PASARELA_TIMEOUT_MS = '10000';

      expect(() => cargarConfiguracion()).toThrow(/debe superar/);
    });

    it('rechaza un TTL de cero', () => {
      process.env.REVENTA_BLOQUEO_TTL_SEGUNDOS = '0';

      expect(() => cargarConfiguracion()).toThrow(/debe ser > 0/);
    });

    it('acepta un TTL holgado', () => {
      process.env.REVENTA_BLOQUEO_TTL_SEGUNDOS = '300';
      process.env.PASARELA_TIMEOUT_MS = '10000';

      expect(cargarConfiguracion().reventa.bloqueoTtlSegundos).toBe(300);
    });
  });

  describe('validación de tipos', () => {
    it('rechaza un valor no numérico donde se espera un número', () => {
      process.env.PUERTO = 'tres mil uno';

      expect(() => cargarConfiguracion()).toThrow(/debe ser numérica/);
    });

    it('rechaza un decimal donde se espera un entero', () => {
      process.env.PUERTO = '3001.5';

      expect(() => cargarConfiguracion()).toThrow(/debe ser un entero/);
    });
  });

  it('exige la contraseña de PostgreSQL en producción', () => {
    // En desarrollo vale el valor por defecto; en producción, arrancar con una
    // contraseña conocida sería un agujero.
    process.env.NODE_ENV = 'production';

    expect(() => cargarConfiguracion()).toThrow(/POSTGRES_CONTRASENA/);
  });
});
