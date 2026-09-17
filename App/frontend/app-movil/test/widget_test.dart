import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hexacore_app/main.dart';
import 'package:hexacore_app/pages/verificar_cuenta_page.dart';
import 'package:hexacore_app/services/cuentas_api.dart';
import 'package:hexacore_app/services/sesion.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Pantallas de cuenta contra un servidor simulado: lo que se prueba es cómo
/// reacciona la app a cada respuesta del CU-027, no el backend.
void main() {
  late List<http.Request> peticiones;
  late http.Response Function(http.Request) servidor;

  http.Response json(int estado, Object cuerpo) =>
      http.Response(jsonEncode(cuerpo), estado,
          headers: {'content-type': 'application/json; charset=utf-8'});

  Map<String, dynamic> sesionDe(List<String> roles) => {
        'token': 'token-de-prueba',
        'tipo': 'Bearer',
        'expiraEn':
            DateTime.now().add(const Duration(minutes: 15)).toIso8601String(),
        'tokenRenovacion': 'renovacion-de-prueba',
        'renovacionExpiraEn':
            DateTime.now().add(const Duration(days: 30)).toIso8601String(),
        'usuario': {
          'id': 'a0000001-0000-4000-8000-000000000001',
          'nombre': 'Ana Gómez',
          'email': 'cliente@hexacore.com',
          'roles': roles,
        },
      };

  setUp(() async {
    SharedPreferences.setMockInitialValues({'onboarding_seen': true});
    sesion.almacen = AlmacenMemoria();
    await sesion.cerrar();
    sesion.motivoCierre = null;
    peticiones = [];
    servidor = (_) => json(500, {});
    cuentasApi = CuentasApi(
      cliente: MockClient((peticion) async {
        peticiones.add(peticion);
        return servidor(peticion);
      }),
    );
  });

  Future<void> arrancar(WidgetTester tester) async {
    await tester.pumpWidget(const HexacoreApp());
    // Restaurar la sesión es asíncrono: hasta entonces hay un indicador.
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));
  }

  Future<void> ingresar(WidgetTester tester, String contrasena) async {
    await tester.enterText(
        find.byKey(const Key('login-contrasena')), contrasena);
    await tester.tap(find.text('Ingresar'));
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));
  }

  testWidgets('muestra el formulario de inicio de sesión', (tester) async {
    await arrancar(tester);
    expect(find.text('HEXACORE'), findsOneWidget);
    expect(find.text('Ingresar'), findsOneWidget);
    // Ninguna contraseña de ejemplo escrita en la app.
    expect(find.textContaining('1234'), findsNothing);
  });

  testWidgets('credenciales incorrectas: muestra el mensaje del servidor',
      (tester) async {
    servidor = (_) => json(401, {
          'codigo': 'CREDENCIALES_INVALIDAS',
          'mensaje': 'El correo o la contraseña no son correctos.',
        });
    await arrancar(tester);
    await ingresar(tester, 'equivocada');

    expect(find.text('El correo o la contraseña no son correctos.'),
        findsOneWidget);
    expect(find.byType(ClientShell), findsNothing);
  });

  testWidgets('login correcto de un Cliente abre su pantalla', (tester) async {
    servidor = (_) => json(200, sesionDe(['Cliente']));
    await arrancar(tester);
    await ingresar(tester, 'hexacore2026');

    expect(find.byType(ClientShell), findsOneWidget);
    expect(sesion.token, 'token-de-prueba');
    expect(jsonDecode(peticiones.single.body)['email'], 'cliente@hexacore.com');
  });

  testWidgets('una cuenta de Personal abre la pantalla de Personal',
      (tester) async {
    servidor = (_) => json(200, sesionDe(['Administrador', 'Personal']));
    await arrancar(tester);
    await ingresar(tester, 'hexacore2026');
    expect(find.byType(StaffShell), findsOneWidget);
  });

  testWidgets(
      'un rol sin app (Organizador) no entra y cierra el token en el servidor',
      (tester) async {
    servidor = (peticion) => peticion.method == 'DELETE'
        ? json(200, {'mensaje': 'Sesión cerrada.'})
        : json(200, sesionDe(['Organizador']));
    await arrancar(tester);
    await ingresar(tester, 'hexacore2026');

    expect(find.byType(LoginPage), findsOneWidget);
    expect(find.textContaining('portal web'), findsOneWidget);
    expect(peticiones.map((p) => p.method), ['POST', 'DELETE']);
    expect(sesion.abierta, isFalse);
  });

  testWidgets('cuenta sin verificar: ofrece pegar el enlace de activación',
      (tester) async {
    servidor = (_) => json(403, {
          'codigo': 'CUENTA_NO_VERIFICADA',
          'mensaje': 'Todavía no confirmaste tu cuenta.',
        });
    await arrancar(tester);
    await ingresar(tester, 'hexacore2026');

    await tester.tap(find.text('Tengo el enlace de activación'));
    await tester.pumpAndSettle();
    expect(find.byType(VerificarCuentaPage), findsOneWidget);
  });

  testWidgets('si la sesión caduca, vuelve al login y dice por qué',
      (tester) async {
    servidor = (_) => json(200, sesionDe(['Cliente']));
    await arrancar(tester);
    await ingresar(tester, 'hexacore2026');
    expect(find.byType(ClientShell), findsOneWidget);

    await sesion.caducada('Tu sesión se cerró. Inicia sesión de nuevo.');
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 100));

    expect(find.byType(LoginPage), findsOneWidget);
    expect(find.text('Tu sesión se cerró. Inicia sesión de nuevo.'),
        findsOneWidget);
  });

  testWidgets('registro → pegar el enlace → cuenta activada', (tester) async {
    const token = 'xhT9vK2mQp4rL8wZabcdefghijklmnopqrstuvwxyz0';
    servidor = (peticion) => switch (peticion.url.path) {
          '/api/v1/cuentas/registro' => json(202, {
              'mensaje':
                  'Si el correo no estaba registrado, te enviamos un enlace.',
            }),
          '/api/v1/cuentas/verificar' => json(200, {
              'mensaje': 'Tu cuenta quedó activada. Ya puedes iniciar sesión.',
            }),
          _ => json(404, {}),
        };
    await arrancar(tester);
    await tester.tap(find.text('¿No tienes cuenta? Regístrate'));
    await tester.pumpAndSettle();

    await tester.enterText(
        find.byKey(const Key('campo-nombre')), 'Elena Prueba');
    await tester.enterText(
        find.byKey(const Key('campo-correo')), 'elena@hexacore.com');
    await tester.enterText(
        find.descendant(
            of: find.byKey(const Key('campo-contrasena')),
            matching: find.byType(TextField)),
        'una frase de paso larga');
    await tester.enterText(
        find.descendant(
            of: find.byKey(const Key('campo-confirmacion')),
            matching: find.byType(TextField)),
        'una frase de paso larga');
    await tester.ensureVisible(find.byKey(const Key('aceptar-terminos')));
    await tester.tap(find.byKey(const Key('aceptar-terminos')));
    await tester.pump();
    await tester.ensureVisible(find.byKey(const Key('boton-crear-cuenta')));
    await tester.tap(find.byKey(const Key('boton-crear-cuenta')));
    await tester.pumpAndSettle();
    expect(find.byType(VerificarCuentaPage), findsOneWidget);
    expect(find.textContaining('te enviamos un enlace'), findsOneWidget);
    expect(jsonDecode(peticiones.single.body), {
      'nombre': 'Elena Prueba',
      'email': 'elena@hexacore.com',
      'contrasena': 'una frase de paso larga',
    });

    await tester.enterText(find.byKey(const Key('campo-enlace')),
        'http://localhost:4200/cuenta/verificar?token=$token');
    await tester.tap(find.byKey(const Key('boton-activar')));
    await tester.pumpAndSettle();

    expect(jsonDecode(peticiones.last.body), {'token': token});
    expect(find.byType(LoginPage), findsOneWidget);
    expect(find.text('Tu cuenta quedó activada. Ya puedes iniciar sesión.'),
        findsOneWidget);
  });

  testWidgets('si una renovación le quita los roles de la app, la cierra',
      (tester) async {
    servidor = (peticion) => switch (peticion.url.path) {
          '/api/v1/sesiones' => json(200, sesionDe(['Cliente'])),
          '/api/v1/sesiones/renovar' => json(200, {
              'token': 'token-renovado',
              'tipo': 'Bearer',
              'expiraEn': DateTime.now()
                  .add(const Duration(minutes: 15))
                  .toIso8601String(),
              'tokenRenovacion': 'renovacion-2',
              'renovacionExpiraEn': DateTime.now()
                  .add(const Duration(days: 30))
                  .toIso8601String(),
              'roles': ['Organizador'],
            }),
          _ => json(200, {'mensaje': 'Sesión cerrada.'}),
        };
    await arrancar(tester);
    await ingresar(tester, 'hexacore2026');
    expect(find.byType(ClientShell), findsOneWidget);

    await sesion.renovar();
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 200));

    expect(find.byType(LoginPage), findsOneWidget);
    expect(find.textContaining('portal web'), findsOneWidget);
    expect(sesion.abierta, isFalse);
  });
}
