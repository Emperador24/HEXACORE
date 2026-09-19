// Prueba de extremo a extremo del CU-027 en la app, contra el backend REAL.
//
// A diferencia de test/, aquí no hay servidor simulado: la app corre en un
// simulador y habla con los servicios de App/infra (Administración en 3002,
// Entradas en 3001, buzón de correo en 3098).
//
//   docker compose -f ../../infra/docker-compose.yml --profile servicios up -d
//   (cd ../../services/entradas-mercado-secundario && npm run semilla)
//   flutter test integration_test -d <simulador de iOS>
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hexacore_app/main.dart';
import 'package:hexacore_app/pages/verificar_cuenta_page.dart';
import 'package:hexacore_app/services/cuentas_api.dart';
import 'package:hexacore_app/services/servidor.dart';
import 'package:hexacore_app/services/sesion.dart';
import 'package:http/http.dart' as http;
import 'package:integration_test/integration_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

const _contrasena = 'una frase de paso larga';

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  setUp(() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool('onboarding_seen', true);
    await sesion.cerrar();
    cuentasApi = CuentasApi();
  });

  /// Bombea hasta que aparezca [buscado]. En un dispositivo real no sirve
  /// `pumpAndSettle`: hay animaciones que no terminan nunca.
  Future<void> esperar(WidgetTester tester, Finder buscado,
      {Duration limite = const Duration(seconds: 20)}) async {
    final fin = DateTime.now().add(limite);
    while (DateTime.now().isBefore(fin)) {
      await tester.pump(const Duration(milliseconds: 200));
      if (buscado.evaluate().isNotEmpty) return;
    }
    fail('No apareció: $buscado');
  }

  /// Lo contrario de [esperar]: bombea hasta que [buscado] ya no esté.
  Future<void> esperarSalida(WidgetTester tester, Finder buscado,
      {Duration limite = const Duration(seconds: 20)}) async {
    final fin = DateTime.now().add(limite);
    while (DateTime.now().isBefore(fin)) {
      await tester.pump(const Duration(milliseconds: 200));
      if (buscado.evaluate().isEmpty) return;
    }
    fail('No desapareció: $buscado');
  }

  Future<void> escribir(WidgetTester tester, Finder campo, String texto) async {
    final editable = find.descendant(of: campo, matching: find.byType(EditableText));
    await tester.enterText(editable.evaluate().isEmpty ? campo : editable, texto);
  }

  Future<void> tocar(WidgetTester tester, Finder boton) async {
    await tester.ensureVisible(boton);
    await tester.pump();
    await tester.tap(boton);
    await tester.pump();
  }

  Future<void> ingresar(WidgetTester tester, String email, String contrasena) async {
    await escribir(tester, find.byKey(const Key('login-correo')), email);
    await escribir(tester, find.byKey(const Key('login-contrasena')), contrasena);
    await tocar(tester, find.text('Ingresar'));
  }

  Future<void> abrirReventa(WidgetTester tester) async {
    await tocar(tester, find.text('Reventa').last);
  }

  /// Sale de la reventa y vuelve, que es lo que provoca una carga nueva.
  ///
  /// Hay que esperar a que la pantalla anterior **desaparezca de verdad**: el
  /// `AnimatedSwitcher` del shell mantiene la saliente 260 ms, así que volver
  /// enseguida reaparece la misma pantalla —con sus entradas ya pintadas— sin
  /// que nadie vuelva a pedir nada al servidor. La prueba pasaba por delante de
  /// la petición que quería comprobar.
  Future<void> recargarReventa(WidgetTester tester) async {
    await tocar(tester, find.text('Inicio').last);
    await esperarSalida(tester, find.textContaining('TCK-2026-'));
    await abrirReventa(tester);
  }

  testWidgets('registro → correo → activación → login → reventa (cuenta nueva)', (tester) async {
    final email = 'app${DateTime.now().millisecondsSinceEpoch}@hexacore.com';

    await tester.pumpWidget(const HexacoreApp());
    await esperar(tester, find.byType(LoginPage));

    // Pasos 1-4.
    await tocar(tester, find.text('¿No tienes cuenta? Regístrate'));
    await esperar(tester, find.byKey(const Key('campo-nombre')));
    await escribir(tester, find.byKey(const Key('campo-nombre')), 'Prueba Simulador');
    await escribir(tester, find.byKey(const Key('campo-correo')), email);
    await escribir(tester, find.byKey(const Key('campo-contrasena')), _contrasena);
    await escribir(tester, find.byKey(const Key('campo-confirmacion')), _contrasena);
    await tocar(tester, find.byKey(const Key('aceptar-terminos')));
    await tocar(tester, find.byKey(const Key('boton-crear-cuenta')));
    await esperar(tester, find.byType(VerificarCuentaPage));

    // Paso 5: el correo llega al buzón simulado, como le llegaría a la persona.
    String? enlace;
    for (var i = 0; i < 40 && enlace == null; i++) {
      final respuesta = await http.get(Uri.parse('${Servidor.buzonDesarrollo}?para=$email'));
      final correos = (jsonDecode(respuesta.body)['correos'] as List<dynamic>);
      if (correos.isNotEmpty) {
        enlace = RegExp(r'http\S+token=\S+').firstMatch(correos.first['texto'] as String)?.group(0);
      }
      await tester.pump(const Duration(milliseconds: 250));
    }
    expect(enlace, isNotNull, reason: 'no llegó el correo de verificación');

    // Pasos 6-7: se pega el enlace completo.
    await escribir(tester, find.byKey(const Key('campo-enlace')), enlace!);
    await tocar(tester, find.byKey(const Key('boton-activar')));
    await esperar(tester, find.textContaining('quedó activada'));
    expect(find.byType(LoginPage), findsOneWidget);

    // Pasos 8-9.
    await ingresar(tester, email, _contrasena);
    await esperar(tester, find.byType(ClientShell));
    expect(sesion.usuario!.nombre, 'Prueba Simulador');

    // Con el token, la reventa responde: una cuenta nueva no tiene entradas.
    await abrirReventa(tester);
    await esperar(tester, find.text('Todavía no tienes entradas.'));
  });

  testWidgets('contraseña equivocada: mensaje del servidor, sin sesión', (tester) async {
    await tester.pumpWidget(const HexacoreApp());
    await esperar(tester, find.byType(LoginPage));
    await ingresar(tester, 'bruno@hexacore.com', 'no es la contraseña');
    await esperar(tester, find.byKey(const Key('login-error')));
    expect(find.textContaining('no son correctos'), findsOneWidget);
    expect(sesion.abierta, isFalse);
  });

  testWidgets('cuenta de ejemplo → sus entradas → sesión cerrada desde fuera → login',
      (tester) async {
    await tester.pumpWidget(const HexacoreApp());
    await esperar(tester, find.byType(LoginPage));
    await ingresar(tester, 'cliente@hexacore.com', 'hexacore2026');
    await esperar(tester, find.byType(ClientShell));

    await abrirReventa(tester);
    await esperar(tester, find.textContaining('TCK-2026-'));

    // Alguien cierra esta sesión en otro sitio (o se cambió la contraseña en
    // otro dispositivo): el token deja de valer en todo el sistema.
    final revocado = await http.delete(
      Uri.parse('${Servidor.api}/${Servidor.prefijo}/sesiones/actual'),
      headers: {'Authorization': 'Bearer ${sesion.token}'},
    );
    expect(revocado.statusCode, 200);

    // La siguiente petición de la reventa recibe 401 y la app vuelve al login.
    await recargarReventa(tester);
    await esperar(tester, find.byType(LoginPage));
    expect(find.textContaining('sesión'), findsWidgets);
    expect(sesion.abierta, isFalse);
  });

  testWidgets('el acceso caduca con la app abierta: la renueva sola y sigue en la reventa',
      (tester) async {
    await tester.pumpWidget(const HexacoreApp());
    await esperar(tester, find.byType(LoginPage));
    await ingresar(tester, 'cliente@hexacore.com', 'hexacore2026');
    await esperar(tester, find.byType(ClientShell));
    await abrirReventa(tester);
    await esperar(tester, find.textContaining('TCK-2026-'));

    final tokenAntes = sesion.token!;
    final renovacionAntes = sesion.tokenRenovacion!;
    String jti(String t) =>
        (jsonDecode(utf8.decode(base64Url.decode(base64Url.normalize(t.split('.')[1]))))
            as Map<String, dynamic>)['jti'] as String;

    // Pasaron los 15 minutos. La siguiente carga de la reventa renueva sola.
    sesion.caducarAccesoParaPruebas();
    await recargarReventa(tester);
    await esperar(tester, find.textContaining('TCK-2026-'));

    expect(find.byType(LoginPage), findsNothing);
    expect(sesion.token, isNot(tokenAntes));
    expect(sesion.tokenRenovacion, isNot(renovacionAntes));
    expect(jti(sesion.token!), jti(tokenAntes), reason: 'debe ser la misma sesión');

    // El token de renovación viejo ya no sirve: usarlo cierra la sesión.
    final robado = await http.post(
      Uri.parse('${Servidor.api}/${Servidor.prefijo}/sesiones/renovar'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({'tokenRenovacion': renovacionAntes}),
    );
    expect(robado.statusCode, 401);
    await recargarReventa(tester);
    await esperar(tester, find.byType(LoginPage));
    expect(find.textContaining('Por seguridad'), findsOneWidget);
  });

  testWidgets('cada empleado entra al área que le asignó el administrador',
      (tester) async {
    // El área no está escrita en la app: la asigna un administrador al dar de
    // alta al empleado (CU-018) y la app la consulta al entrar. Dos cuentas de
    // Personal, dos áreas distintas, dos juegos de pantallas.
    await tester.pumpWidget(const HexacoreApp());
    await esperar(tester, find.byType(LoginPage));
    await ingresar(tester, 'parqueadero@hexacore.com', 'hexacore2026');
    await esperar(tester, find.byType(StaffShell));

    expect(sesion.usuario!.roles, contains('Personal'));
    expect(find.text('Parqueadero'), findsWidgets);
    // Y no ve lo que no le toca.
    expect(find.text('Validar entradas'), findsNothing);
    expect(find.byType(ClientShell), findsNothing);

    await cuentasApi.cerrarSesion();
    await esperar(tester, find.byType(LoginPage));

    await ingresar(tester, 'personal@hexacore.com', 'hexacore2026');
    await esperar(tester, find.byType(StaffShell));
    expect(find.text('Validar entradas'), findsWidgets);
    expect(find.text('Parqueadero'), findsNothing);
  });

  testWidgets('la sesión sobrevive a reiniciar la app (llavero)', (tester) async {
    await cuentasApi.iniciarSesion('cliente@hexacore.com', 'hexacore2026');
    // Una sesión nueva, vacía, que solo puede salir del almacén seguro.
    final recuperada = Sesion();
    await recuperada.restaurar();
    expect(recuperada.abierta, isTrue);
    expect(recuperada.usuario!.email, 'cliente@hexacore.com');
    expect(recuperada.token, sesion.token);

    await cuentasApi.cerrarSesion();
    final tras = Sesion();
    await tras.restaurar();
    expect(tras.abierta, isFalse, reason: 'cerrar sesión debe borrar el llavero');
  });
}
