import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:hexacore_app/services/cuentas_api.dart';
import 'package:hexacore_app/services/sesion.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

const _usuario = {
  'id': 'a0000001-0000-4000-8000-000000000001',
  'nombre': 'Ana Gómez',
  'email': 'cliente@hexacore.com',
  'roles': ['Cliente'],
};

http.Response _json(int estado, Object cuerpo) => http.Response(
      jsonEncode(cuerpo),
      estado,
      headers: {'content-type': 'application/json; charset=utf-8'},
    );

void main() {
  late Sesion sesionPrueba;
  late List<http.Request> peticiones;

  CuentasApi api(http.Response Function(http.Request) responder) {
    peticiones = [];
    return CuentasApi(
      sesionActual: sesionPrueba,
      cliente: MockClient((peticion) async {
        peticiones.add(peticion);
        return responder(peticion);
      }),
    );
  }

  TokensSesion tokens(String acceso,
          {Duration vida = const Duration(minutes: 15),
          String renovacion = 'renovacion-1'}) =>
      TokensSesion(
        acceso: acceso,
        accesoExpiraEn: DateTime.now().add(vida),
        renovacion: renovacion,
        renovacionExpiraEn: DateTime.now().add(const Duration(days: 30)),
      );

  Future<void> abrirSesion({Duration vida = const Duration(minutes: 15)}) =>
      sesionPrueba.abrir(
        tokens: tokens('token-vigente', vida: vida),
        usuario: UsuarioSesion.desdeJson(_usuario),
      );

  Map<String, dynamic> renovado(String acceso, String renovacion,
          {List<String> roles = const ['Cliente']}) =>
      {
        'token': acceso,
        'tipo': 'Bearer',
        'expiraEn':
            DateTime.now().add(const Duration(minutes: 15)).toIso8601String(),
        'tokenRenovacion': renovacion,
        'renovacionExpiraEn':
            DateTime.now().add(const Duration(days: 30)).toIso8601String(),
        'roles': roles,
      };

  setUp(() => sesionPrueba = Sesion(almacen: AlmacenMemoria()));

  group('iniciarSesion (CU-027 pasos 8-9)', () {
    test('abre y guarda la sesión con lo que devuelve el servidor', () async {
      final cuentas = api((_) => _json(200, {
            ...renovado('abc.def.ghi', 'renovacion-inicial'),
            'usuario': _usuario,
          }));

      final usuario =
          await cuentas.iniciarSesion(' cliente@hexacore.com ', 'hexacore2026');

      expect(usuario.nombre, 'Ana Gómez');
      expect(sesionPrueba.abierta, isTrue);
      expect(sesionPrueba.token, 'abc.def.ghi');
      expect(sesionPrueba.tokenRenovacion, 'renovacion-inicial');
      expect(peticiones.single.url.path, '/api/v1/sesiones');
      expect(jsonDecode(peticiones.single.body),
          {'email': 'cliente@hexacore.com', 'contrasena': 'hexacore2026'});
    });

    test(
        'un 401 en el login muestra el mensaje del servidor y no toca la sesión',
        () async {
      await abrirSesion();
      final cuentas = api((_) => _json(401, {
            'codigo': 'CREDENCIALES_INVALIDAS',
            'mensaje': 'El correo o la contraseña no son correctos.',
          }));

      await expectLater(
        cuentas.iniciarSesion('x@hexacore.com', 'mal'),
        throwsA(isA<CuentasApiException>()
            .having((e) => e.codigo, 'codigo', 'CREDENCIALES_INVALIDAS')
            .having((e) => e.mensaje, 'mensaje', contains('no son correctos'))),
      );
      // Es "credenciales incorrectas", no "tu sesión caducó".
      expect(sesionPrueba.abierta, isTrue);
    });

    test('sin red se dice en claro, sin inventar un código HTTP', () async {
      final cuentas = CuentasApi(
        sesionActual: sesionPrueba,
        cliente: MockClient((_) async => throw http.ClientException('sin red')),
      );
      await expectLater(
        cuentas.iniciarSesion('a@b.co', 'x'),
        throwsA(isA<CuentasApiException>()
            .having((e) => e.sinConexion, 'sinConexion', isTrue)),
      );
    });
  });

  group('peticiones con sesión', () {
    test('llevan el token y ninguna cabecera X-Usuario-Id', () async {
      await abrirSesion();
      final cuentas = api((_) => _json(200, _usuario));

      await cuentas.comprobarSesion();

      final cabeceras = peticiones.single.headers;
      expect(cabeceras['Authorization'], 'Bearer token-vigente');
      expect(cabeceras.keys.map((k) => k.toLowerCase()),
          isNot(contains('x-usuario-id')));
    });

    test('un 401 cierra la sesión y deja el motivo para mostrarlo', () async {
      await abrirSesion();
      final cuentas = api((_) => _json(401, {
            'codigo': 'SIN_AUTENTICAR',
            'mensaje': 'Tu sesión no es válida o ya caducó.',
          }));

      await expectLater(
          cuentas.comprobarSesion(), throwsA(isA<CuentasApiException>()));

      expect(sesionPrueba.abierta, isFalse);
      expect(sesionPrueba.motivoCierre, contains('caducó'));
    });

    test('cerrar sesión la cierra en el servidor y en el teléfono', () async {
      await abrirSesion();
      final cuentas = api((_) => _json(200, {'mensaje': 'Sesión cerrada.'}));

      await cuentas.cerrarSesion();

      expect(peticiones.single.method, 'DELETE');
      expect(peticiones.single.url.path, '/api/v1/sesiones/actual');
      expect(sesionPrueba.abierta, isFalse);
      // La persona lo pidió: no hay nada que avisarle.
      expect(sesionPrueba.motivoCierre, isNull);
    });

    test('cerrar sesión sin red igual la cierra en el teléfono', () async {
      await abrirSesion();
      final cuentas = CuentasApi(
        sesionActual: sesionPrueba,
        cliente: MockClient((_) async => throw http.ClientException('sin red')),
      );
      await cuentas.cerrarSesion();
      expect(sesionPrueba.abierta, isFalse);
    });

    test('bloqueo al cambiar la contraseña (CU-027D) cierra la sesión',
        () async {
      await abrirSesion();
      final cuentas = api((_) => _json(429, {
            'codigo': 'CUENTA_BLOQUEADA',
            'mensaje': 'Demasiados intentos fallidos.',
          }));

      await expectLater(
        cuentas.cambiarContrasena(actual: 'x', nueva: 'y'),
        throwsA(isA<CuentasApiException>()),
      );
      expect(sesionPrueba.abierta, isFalse);
      expect(sesionPrueba.motivoCierre, 'Demasiados intentos fallidos.');
    });

    test('editar el nombre actualiza el usuario de la sesión', () async {
      await abrirSesion();
      final cuentas =
          api((_) => _json(200, {..._usuario, 'nombre': 'Ana María Gómez'}));

      await cuentas.editarNombre('  Ana María Gómez ');

      expect(jsonDecode(peticiones.single.body), {'nombre': 'Ana María Gómez'});
      expect(sesionPrueba.usuario!.nombre, 'Ana María Gómez');
    });
  });

  test('los errores de validación de NestJS se muestran como texto', () async {
    final cuentas = api((_) => _json(400, {
          'message': ['El nombre debe tener entre 2 y 160 caracteres'],
          'statusCode': 400,
        }));
    await expectLater(
      cuentas.registrar(nombre: 'A', email: 'a@b.co', contrasena: 'x'),
      throwsA(isA<CuentasApiException>().having((e) => e.mensaje, 'mensaje',
          'El nombre debe tener entre 2 y 160 caracteres')),
    );
  });

  group('tokenDeEnlace', () {
    const token = 'xhT9vK2mQp4rL8wZabcdefghijklmnopqrstuvwxyz0';
    test('saca el token del enlace completo del correo', () {
      expect(
          tokenDeEnlace('http://localhost:4200/cuenta/verificar?token=$token'),
          token);
    });
    test('acepta el token solo, con espacios alrededor', () {
      expect(tokenDeEnlace('  $token\n'), token);
    });
    test('rechaza texto que no es un enlace ni un token', () {
      expect(tokenDeEnlace(''), isNull);
      expect(tokenDeEnlace('hola'), isNull);
      expect(tokenDeEnlace('no es un token válido con espacios'), isNull);
    });
  });

  group('Sesion', () {
    test('se restaura desde el almacén', () async {
      final almacen = AlmacenMemoria();
      await Sesion(almacen: almacen).abrir(
        tokens: tokens('t', vida: const Duration(minutes: 5)),
        usuario: UsuarioSesion.desdeJson(_usuario),
      );
      final nueva = Sesion(almacen: almacen);
      await nueva.restaurar();
      expect(nueva.abierta, isTrue);
      expect(nueva.tokenRenovacion, 'renovacion-1');
      expect(nueva.usuario!.email, 'cliente@hexacore.com');
    });

    test('con el acceso caducado pero renovable, la sesión sigue abierta',
        () async {
      final almacen = AlmacenMemoria();
      await Sesion(almacen: almacen).abrir(
        tokens: tokens('t', vida: const Duration(minutes: -1)),
        usuario: UsuarioSesion.desdeJson(_usuario),
      );
      final nueva = Sesion(almacen: almacen);
      await nueva.restaurar();
      expect(nueva.abierta, isTrue);
    });

    test('sin poder renovar, una sesión caducada se descarta al restaurar',
        () async {
      final almacen = AlmacenMemoria();
      await Sesion(almacen: almacen).abrir(
        tokens: TokensSesion(
          acceso: 't',
          accesoExpiraEn: DateTime.now().subtract(const Duration(minutes: 1)),
          renovacion: 'r',
          renovacionExpiraEn: DateTime.now().subtract(const Duration(days: 1)),
        ),
        usuario: UsuarioSesion.desdeJson(_usuario),
      );
      final nueva = Sesion(almacen: almacen);
      await nueva.restaurar();
      expect(nueva.abierta, isFalse);
      expect(almacen.datos, isEmpty);
    });

    test('datos corruptos no rompen el arranque', () async {
      final almacen = AlmacenMemoria()
        ..datos.addAll({
          'hexacore.sesion.token': 't',
          'hexacore.sesion.expira': 'no es una fecha',
          'hexacore.sesion.usuario': '{',
        });
      final nueva = Sesion(almacen: almacen);
      await nueva.restaurar();
      expect(nueva.abierta, isFalse);
      expect(almacen.datos, isEmpty);
    });
  });

  group('renovación (DECISIONES.md §21 del backend)', () {
    bool esRenovacion(http.Request p) =>
        p.url.path == '/api/v1/sesiones/renovar';

    test('un 401 renueva y repite la petición con el token nuevo', () async {
      await abrirSesion();
      final cuentas = api((p) {
        if (esRenovacion(p)) {
          return _json(200, renovado('token-nuevo', 'renovacion-2'));
        }
        return p.headers['Authorization'] == 'Bearer token-nuevo'
            ? _json(200, _usuario)
            : _json(401, {'codigo': 'SIN_AUTENTICAR', 'mensaje': 'caducado'});
      });

      await cuentas.comprobarSesion();

      expect(peticiones.map((p) => p.url.path), [
        '/api/v1/sesiones/actual',
        '/api/v1/sesiones/renovar',
        '/api/v1/sesiones/actual',
      ]);
      expect(
          jsonDecode(peticiones[1].body), {'tokenRenovacion': 'renovacion-1'});
      expect(peticiones[1].headers.containsKey('Authorization'), isFalse);
      expect(sesionPrueba.token, 'token-nuevo');
      expect(sesionPrueba.tokenRenovacion, 'renovacion-2');
      expect(sesionPrueba.abierta, isTrue);
    });

    test('si el acceso está por caducar, renueva ANTES de enviar', () async {
      await abrirSesion(vida: const Duration(seconds: 30));
      final cuentas = api((p) => esRenovacion(p)
          ? _json(200, renovado('token-nuevo', 'renovacion-2'))
          : _json(200, _usuario));

      await cuentas.comprobarSesion();

      expect(peticiones.map((p) => p.url.path),
          ['/api/v1/sesiones/renovar', '/api/v1/sesiones/actual']);
      expect(peticiones.last.headers['Authorization'], 'Bearer token-nuevo');
    });

    test('varias peticiones a la vez con el acceso caducado: UNA renovación',
        () async {
      await abrirSesion(vida: const Duration(minutes: -1));
      final cuentas = api((p) => esRenovacion(p)
          ? _json(200, renovado('token-nuevo', 'renovacion-2'))
          : _json(200, _usuario));

      await Future.wait([
        cuentas.comprobarSesion(),
        cuentas.comprobarSesion(),
        cuentas.comprobarSesion(),
      ]);

      // Si cada una renovara, la segunda usaría un token ya gastado y el
      // servidor cerraría la sesión por "robo".
      expect(peticiones.where(esRenovacion), hasLength(1));
      expect(
          peticiones
              .where((p) => !esRenovacion(p))
              .map((p) => p.headers['Authorization']),
          everyElement('Bearer token-nuevo'));
    });

    test('varios 401 a la vez: una sola renovación y todas se repiten',
        () async {
      await abrirSesion();
      final cuentas = api((p) {
        if (esRenovacion(p)) {
          return _json(200, renovado('token-nuevo', 'renovacion-2'));
        }
        return p.headers['Authorization'] == 'Bearer token-nuevo'
            ? _json(200, _usuario)
            : _json(401, {'codigo': 'SIN_AUTENTICAR', 'mensaje': 'caducado'});
      });

      await Future.wait(List.generate(4, (_) => cuentas.comprobarSesion()));

      expect(peticiones.where(esRenovacion), hasLength(1));
      expect(sesionPrueba.abierta, isTrue);
    });

    test('si el servidor rechaza la renovación, se cierra con SU mensaje',
        () async {
      await abrirSesion(vida: const Duration(minutes: -1));
      final cuentas = api((_) => _json(401, {
            'codigo': 'SESION_CERRADA_POR_SEGURIDAD',
            'mensaje': 'Por seguridad cerramos tu sesión.',
          }));

      await expectLater(
          cuentas.comprobarSesion(), throwsA(isA<CuentasApiException>()));

      expect(sesionPrueba.abierta, isFalse);
      expect(sesionPrueba.motivoCierre, 'Por seguridad cerramos tu sesión.');
      expect(peticiones.single.url.path, '/api/v1/sesiones/renovar');
    });

    test('sin red al renovar: la sesión se conserva y la petición falla',
        () async {
      await abrirSesion(vida: const Duration(minutes: -1));
      final cuentas = CuentasApi(
        sesionActual: sesionPrueba,
        cliente: MockClient((_) async => throw http.ClientException('sin red')),
      );

      await expectLater(
        cuentas.comprobarSesion(),
        throwsA(isA<CuentasApiException>()
            .having((e) => e.sinConexion, 'sinConexion', isTrue)),
      );
      expect(sesionPrueba.abierta, isTrue);
      expect(sesionPrueba.tokenRenovacion, 'renovacion-1');
    });

    test('un 401 que no se arregla renovando cierra la sesión', () async {
      await abrirSesion();
      final cuentas = api((p) => esRenovacion(p)
          ? _json(200, renovado('token-nuevo', 'renovacion-2'))
          : _json(
              401, {'codigo': 'SIN_AUTENTICAR', 'mensaje': 'Sesión cerrada.'}));

      await expectLater(
          cuentas.comprobarSesion(), throwsA(isA<CuentasApiException>()));

      // Una renovación y un reintento, no un bucle.
      expect(peticiones, hasLength(3));
      expect(sesionPrueba.abierta, isFalse);
    });

    test('los roles que trae la renovación actualizan el usuario', () async {
      await abrirSesion(vida: const Duration(minutes: -1));
      final cuentas = api((p) => esRenovacion(p)
          ? _json(
              200, renovado('token-nuevo', 'renovacion-2', roles: ['Personal']))
          : _json(200, {'mensaje': 'ok'}));

      await cuentas.cambiarContrasena(actual: 'a', nueva: 'b');

      expect(sesionPrueba.usuario!.roles, ['Personal']);
    });

    test('los tokens renovados sobreviven a reiniciar la app', () async {
      final almacen = AlmacenMemoria();
      sesionPrueba = Sesion(almacen: almacen);
      await abrirSesion(vida: const Duration(minutes: -1));
      final cuentas = api((p) => esRenovacion(p)
          ? _json(200, renovado('token-nuevo', 'renovacion-2'))
          : _json(200, _usuario));
      await cuentas.comprobarSesion();

      final reiniciada = Sesion(almacen: almacen);
      await reiniciada.restaurar();
      expect(reiniciada.token, 'token-nuevo');
      expect(reiniciada.tokenRenovacion, 'renovacion-2');
    });
  });
}
