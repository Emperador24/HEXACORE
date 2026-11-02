import { cifrarContrasena, problemaDeContrasena, verificarContrasena } from './contrasenas';

/**
 * El paso 4 del CU-027 dice *"cifra la contraseña"* y su atributo de Seguridad
 * exige *"hash + salt"*. Lo que estas pruebas fijan no es que el código
 * "funcione", sino las propiedades que hacen que cifrar sirva de algo: que el
 * hash no contenga la contraseña, que dos iguales no produzcan el mismo hash, y
 * que verificar nunca lance.
 *
 * `scrypt` tarda ~100 ms por diseño, así que estas pruebas son lentas a
 * propósito; el `timeout` ampliado no esconde un problema.
 */
jest.setTimeout(30_000);

describe('cifrarContrasena', () => {
  it('no guarda la contraseña en ninguna parte del hash', async () => {
    const hash = await cifrarContrasena('hexacore2026');

    expect(hash).not.toContain('hexacore2026');
  });

  it('produce un hash distinto cada vez, aunque la contraseña sea la misma', async () => {
    // Es el efecto del salt. Sin él, dos personas con la misma contraseña
    // compartirían hash: romper uno sería romper los dos, y una tabla
    // precalculada valdría para toda la base.
    const [a, b] = [await cifrarContrasena('misma'), await cifrarContrasena('misma')];

    expect(a).not.toBe(b);
    expect(await verificarContrasena('misma', a)).toBe(true);
    expect(await verificarContrasena('misma', b)).toBe(true);
  });

  it('guarda los parámetros de coste dentro del hash', async () => {
    // Van dentro para poder subir el coste más adelante sin invalidar las
    // contraseñas ya guardadas: cada una se verifica con los suyos.
    const [etiqueta, n, r, p] = (await cifrarContrasena('x'.repeat(12))).split('$');

    expect(etiqueta).toBe('scrypt');
    expect(Number(n)).toBe(2 ** 15);
    expect(Number(r)).toBe(8);
    expect(Number(p)).toBe(1);
  });
});

describe('verificarContrasena', () => {
  it('acepta la contraseña correcta', async () => {
    const hash = await cifrarContrasena('hexacore2026');

    expect(await verificarContrasena('hexacore2026', hash)).toBe(true);
  });

  it.each([
    ['una letra distinta', 'hexacore2027'],
    ['distinta capitalización', 'Hexacore2026'],
    ['un espacio de más', 'hexacore2026 '],
    ['vacía', ''],
  ])('rechaza una contraseña con %s', async (_caso, intento) => {
    const hash = await cifrarContrasena('hexacore2026');

    expect(await verificarContrasena(intento, hash)).toBe(false);
  });

  it.each([['basura'], [''], ['scrypt$mal'], ['bcrypt$1$2$3$4$5']])(
    'devuelve false sin lanzar ante un hash corrupto (%s)',
    async (corrupto) => {
      // Si lanzara, el login distinguiría "hash corrupto" de "contraseña
      // incorrecta" y filtraría información sobre el estado de la cuenta.
      await expect(verificarContrasena('cualquiera', corrupto)).resolves.toBe(false);
    },
  );
});

describe('problemaDeContrasena (CU-027 paso 2)', () => {
  it('acepta una contraseña que llega al mínimo', () => {
    expect(problemaDeContrasena('hexacore2026', 10)).toBeNull();
  });

  it('acepta una frase de paso sin números ni símbolos', () => {
    // No se exige composición a propósito: las frases largas son más seguras y
    // más fáciles de recordar que "Password1!".
    expect(problemaDeContrasena('una frase de paso larga', 10)).toBeNull();
  });

  it('rechaza una contraseña por debajo del mínimo', () => {
    expect(problemaDeContrasena('corta', 10)).toContain('al menos 10');
  });

  it.each([['password123'], ['contrasena123'], ['qwertyuiop']])(
    'rechaza una contraseña demasiado común (%s)',
    (comun) => {
      // La longitud sola no basta: estas cumplen el mínimo y son de las
      // primeras que prueba cualquier atacante.
      expect(problemaDeContrasena(comun, 10)).toContain('común');
    },
  );

  it('detecta las comunes aunque lleven tildes o mayúsculas', () => {
    expect(problemaDeContrasena('Contraseña123', 10)).toContain('común');
  });

  it('rechaza una contraseña de solo espacios', () => {
    expect(problemaDeContrasena('            ', 10)).toContain('vacía');
  });
});
