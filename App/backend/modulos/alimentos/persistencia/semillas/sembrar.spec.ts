/** Ejecuta el script con un DataSource simulado: nunca conecta a PostgreSQL. */
describe('Semilla de Pedidos', () => {
  it('puede repetirse, limpia todas las FK y conserva migraciones', async () => {
    const tablas = new Map<string, unknown[]>();
    tablas.set('migraciones', ['inicial', 'reservas']);
    const query = jest.fn(async (sql: string) => {
      // PostgreSQL exige incluir las tablas que referencian al grupo truncado,
      // aunque estén vacías. Modelar la FK que rechazó la instalación nueva.
      const incluidas = new Set([...sql.matchAll(/"([a-z_]+)"/g)].map(m => m[1]));
      for (const padre of ['historial_preparacion', 'pedidos', 'transacciones_pedido']) {
        if (incluidas.has(padre) && !incluidas.has('cancelaciones_pedido')) {
          throw new Error(`FK RESTRICT: cancelaciones_pedido referencia ${padre}`);
        }
      }
      expect(sql).toContain('"reservas_inventario"');
      expect(sql).not.toContain('"migraciones"');
      expect(sql).toContain('RESTRICT');
      for (const tabla of [...tablas.keys()]) if (tabla !== 'migraciones') tablas.delete(tabla);
    });
    const insert = jest.fn(async (tipo: { name: string }, filas: unknown[]) => {
      if (tablas.has(tipo.name)) throw new Error('Duplicados');
      tablas.set(tipo.name, structuredClone(filas));
    });
    jest.spyOn(console, 'log').mockImplementation(() => {});
    try {
      let anterior: Map<string, unknown[]> | undefined;
      for (let i = 0; i < 2; i++) {
        let cerrar!: () => void;
        const terminado = new Promise<void>((resolve) => { cerrar = resolve; });
        const destroy = jest.fn(async () => cerrar());
        jest.doMock('../data-source', () => ({ __esModule: true, default: {
          options: { database: 'pedidos_test' }, isInitialized: true,
          initialize: jest.fn(), destroy,
          transaction: async (trabajo: (gestor: unknown) => Promise<void>) => trabajo({ query, insert }),
        } }));
        jest.doMock('../../comun/config/configuracion', () => ({ cargarConfiguracion: () => ({ entorno: 'test' }) }));
        jest.isolateModules(() => { require('./sembrar'); });
        await terminado;
        expect(destroy).toHaveBeenCalledTimes(1);
        expect(tablas.get('Establecimiento')).toHaveLength(3);
        expect(tablas.get('Producto')).toHaveLength(12);
        expect(tablas.get('migraciones')).toEqual(['inicial', 'reservas']);
        if (anterior) expect(tablas).toEqual(anterior);
        anterior = structuredClone(tablas);
      }
    } finally { jest.restoreAllMocks(); }
  });
});
