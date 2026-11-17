import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hexacore_app/pages/validar_entradas_page.dart';
import 'package:hexacore_app/services/boleteria_api.dart';
import 'package:hexacore_app/services/puerta_local.dart';
import 'package:hexacore_app/services/sesion.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';

const _fest = 'e0000001-0000-4000-8000-000000000001';
const _rock = 'e0000002-0000-4000-8000-000000000002';

Future<Sesion> sesionPersonal() async {
  final s = Sesion(almacen: AlmacenMemoria());
  await s.abrir(
      tokens: TokensSesion(
          acceso: 'token',
          accesoExpiraEn: DateTime.now().add(const Duration(hours: 1)),
          renovacion: 'renovacion',
          renovacionExpiraEn: DateTime.now().add(const Duration(days: 1))),
      usuario: const UsuarioSesion(id: 'p1', nombre: 'Luis', email: 'personal@hexacore.com', roles: ['Personal']));
  return s;
}

http.Response json(Object cuerpo, [int estado = 200]) =>
    http.Response.bytes(utf8.encode(jsonEncode(cuerpo)), estado, headers: {'content-type': 'application/json'});

Map<String, dynamic> evento(String id, String nombre) => {
      'id': id,
      'nombre': nombre,
      'categoria': 'Concierto',
      'fechaInicio': '2026-12-12T01:00:00.000Z',
      'lugar': 'Movistar Arena',
      'ciudad': 'Bogotá',
      'precioDesde': 80000,
      'agotado': false,
      'pasado': false,
    };

Future<void> avanzar(WidgetTester tester, [int veces = 6]) async {
  for (var i = 0; i < veces; i++) {
    await tester.pump(const Duration(milliseconds: 100));
  }
}

/// Simula Boletería: la cartelera, `POST /ingresos` con lo que diga [ingreso],
/// la lista sin red ([validos]; `null` = no se puede descargar) y la
/// sincronización. Con [hayRed] en falso, todo falla como sin conexión.
BoleteriaApi apiCon(
  Sesion sesion,
  List<Map<String, dynamic>> cuerpos,
  http.Response Function(Map<String, dynamic>) ingreso, {
  List<Map<String, dynamic>>? validos,
  List<Map<String, dynamic>>? sincronizados,
  http.Response Function(Map<String, dynamic>)? sincronizacion,
  bool Function()? hayRed,
}) =>
    BoleteriaApi(
      sesionActual: sesion,
      cliente: MockClient((r) async {
        if (hayRed != null && !hayRed()) throw http.ClientException('sin red');
        if (r.url.path == '/api/v1/cartelera') {
          return json({
            'eventos': [evento(_fest, 'HEXACORE Fest 2026'), evento(_rock, 'Noche de Rock Nacional')],
            'total': 2
          });
        }
        if (r.method == 'GET' && r.url.path.startsWith('/api/v1/ingresos/eventos/')) {
          if (validos == null) return json({'mensaje': 'no disponible'}, 503);
          return json({'eventoId': r.url.pathSegments[4], 'generadaEn': '2026-11-16T20:00:00.000Z', 'validos': validos});
        }
        if (r.method == 'POST' && r.url.path == '/api/v1/ingresos/sincronizacion') {
          final cuerpo = jsonDecode(r.body) as Map<String, dynamic>;
          sincronizados?.add(cuerpo);
          return sincronizacion!(cuerpo);
        }
        if (r.method == 'POST' && r.url.path == '/api/v1/ingresos') {
          expect(r.headers['Authorization'], 'Bearer token');
          final cuerpo = jsonDecode(r.body) as Map<String, dynamic>;
          cuerpos.add(cuerpo);
          return ingreso(cuerpo);
        }
        return json({'mensaje': 'no esperado'}, 500);
      }),
    );

// Un código real lleva base64url: distingue mayúsculas.
const _qr = 'HXC-QR-AbC123xyz';
// SHA-256 de [_qr] calculado con node:crypto, como lo guarda el servidor.
const _hashQr = '0ddfac5bbe3abb95c8c63dabc1ebca60c95c6a225359d5845882770f5e4d28df';
final _validos = [
  {'hash': _hashQr, 'numeroTicket': 'TCK-2026-001000', 'localidadNombre': 'General'}
];

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  testWidgets('CU-002: el servidor autoriza; se muestra el ticket y el aforo que devolvió', (tester) async {
    final cuerpos = <Map<String, dynamic>>[];
    final api = apiCon(await sesionPersonal(), cuerpos, (_) => json({
          'autorizado': true,
          'mensaje': 'Ingreso autorizado',
          'numeroTicket': 'TCK-2026-001000',
          'localidadNombre': 'General',
          'eventoNombre': 'Noche de Rock Nacional',
          'registradoEn': '2026-11-17T01:00:00.000Z',
          'asistentes': 1,
          'aforoMaximo': 14000,
        }));

    await tester.pumpWidget(MaterialApp(
        home: Scaffold(body: ValidarEntradasPage(api: api, eventoDelTurno: () async => _rock))));
    await avanzar(tester);
    // El evento del turno queda preseleccionado.
    expect(find.text('Noche de Rock Nacional'), findsOneWidget);

    await tester.enterText(find.byType(TextField), '  hxc-qr-abc123 ');
    await tester.tap(find.text('Validar'));
    await avanzar(tester);

    expect(cuerpos.single, {'eventoId': _rock, 'codigoQr': 'hxc-qr-abc123'});
    expect(find.text('Puede ingresar'), findsOneWidget);
    expect(find.text('General · Ticket TCK-2026-001000'), findsOneWidget);
    expect(find.text('1/14000'), findsOneWidget);
  });

  testWidgets('CU-002D: un QR ya usado no pasa y se dice cuándo entró', (tester) async {
    final api = apiCon(await sesionPersonal(), [], (_) => json({
          'codigo': 'CU-002D',
          'mensaje': 'Ingreso NO autorizado: esta entrada ya ingresó',
          'autorizado': false,
          'primerIngreso': '2026-11-17T01:00:00.000Z',
        }, 409));

    await tester.pumpWidget(MaterialApp(home: Scaffold(body: ValidarEntradasPage(api: api, eventoDelTurno: () async => null))));
    await avanzar(tester);
    await tester.enterText(find.byType(TextField), 'HXC-QR-USADO1');
    await tester.tap(find.text('Validar'));
    await avanzar(tester);

    expect(find.text('NO puede ingresar'), findsOneWidget);
    expect(find.text('Ingreso NO autorizado: esta entrada ya ingresó'), findsOneWidget);
    expect(find.textContaining('primer ingreso'), findsOneWidget);
  });

  testWidgets('sin conexión y sin lista guardada no hay veredicto: no se muestra "NO puede ingresar"', (tester) async {
    final api = apiCon(await sesionPersonal(), [], (_) => throw http.ClientException('sin red'));

    await tester.pumpWidget(MaterialApp(home: Scaffold(body: ValidarEntradasPage(api: api, eventoDelTurno: () async => null))));
    await avanzar(tester);
    await tester.enterText(find.byType(TextField), 'HXC-QR-000001');
    await tester.tap(find.text('Validar'));
    await avanzar(tester);

    expect(find.text('NO puede ingresar'), findsNothing);
    expect(find.textContaining('Sin conexión y sin la lista de entradas descargada'), findsOneWidget);
  });

  testWidgets('si el turno apunta a un evento que no está en la cartelera, se usa el primero', (tester) async {
    final cuerpos = <Map<String, dynamic>>[];
    final api = apiCon(await sesionPersonal(), cuerpos, (_) => json({'mensaje': 'Ingreso autorizado', 'asistentes': 1}));

    await tester.pumpWidget(MaterialApp(home: Scaffold(body: ValidarEntradasPage(api: api, eventoDelTurno: () async => 'evt-1'))));
    await avanzar(tester);
    expect(find.text('HEXACORE Fest 2026'), findsOneWidget);
    await tester.enterText(find.byType(TextField), 'HXC-QR-000001');
    await tester.tap(find.text('Validar'));
    await avanzar(tester);
    expect(cuerpos.single['eventoId'], _fest);
  });

  test('CU-002E: el hash local es el mismo que guarda el servidor (sin cambiar mayúsculas)', () {
    expect(PuertaLocal.hashQr(_qr), _hashQr);
    expect(PuertaLocal.hashQr('  $_qr '), _hashQr);
    expect(PuertaLocal.hashQr(_qr.toUpperCase()), isNot(_hashQr));
  });

  testWidgets('CU-002E: sin red decide con la lista guardada y no deja pasar dos veces', (tester) async {
    var red = true;
    final api = apiCon(await sesionPersonal(), [], (_) => json({}), validos: _validos, hayRed: () => red);

    await tester.pumpWidget(MaterialApp(home: Scaffold(body: ValidarEntradasPage(api: api, eventoDelTurno: () async => null))));
    await avanzar(tester);
    expect(find.textContaining('Lista sin conexión: 1 entradas válidas'), findsOneWidget);

    red = false;
    await tester.enterText(find.byType(TextField), _qr);
    await tester.tap(find.text('Validar'));
    await avanzar(tester);
    expect(find.text('Puede ingresar'), findsOneWidget);
    expect(find.text('Decidido sin conexión, con la lista guardada'), findsOneWidget);
    expect(find.text('General · Ticket TCK-2026-001000'), findsOneWidget);
    expect(find.text('1 ingreso por sincronizar'), findsOneWidget);

    // El mismo QR otra vez, todavía sin red.
    await tester.enterText(find.byType(TextField), _qr);
    await tester.tap(find.text('Validar'));
    await avanzar(tester);
    expect(find.text('NO puede ingresar'), findsOneWidget);
    expect(find.textContaining('ya ingresó'), findsOneWidget);

    // Uno que no está en la lista (en mayúsculas no es el mismo código).
    await tester.enterText(find.byType(TextField), _qr.toUpperCase());
    await tester.tap(find.text('Validar'));
    await avanzar(tester);
    expect(find.text('El código no está entre las entradas válidas descargadas.'), findsOneWidget);
  });

  testWidgets('CU-002E: al volver la red sincroniza la cola y muestra los conflictos', (tester) async {
    var red = true;
    final sincronizados = <Map<String, dynamic>>[];
    final api = apiCon(
      await sesionPersonal(),
      [],
      (_) => json({}),
      validos: _validos,
      hayRed: () => red,
      sincronizados: sincronizados,
      sincronizacion: (c) => json({
        'registrados': 0,
        'conflictos': 1,
        'resultados': [
          {'codigoQr': _qr, 'resultado': 'CU-002D', 'mensaje': 'Ingreso NO autorizado: esta entrada ya ingresó'}
        ],
      }),
    );

    await tester.pumpWidget(MaterialApp(home: Scaffold(body: ValidarEntradasPage(api: api, eventoDelTurno: () async => _rock))));
    await avanzar(tester);
    red = false;
    await tester.enterText(find.byType(TextField), _qr);
    await tester.tap(find.text('Validar'));
    await avanzar(tester);
    expect(find.text('1 ingreso por sincronizar'), findsOneWidget);

    red = true;
    await tester.tap(find.text('Sincronizar'));
    await avanzar(tester);

    final enviado = sincronizados.single;
    expect(enviado['eventoId'], _rock);
    final ingreso = (enviado['ingresos'] as List).single as Map<String, dynamic>;
    expect(ingreso['codigoQr'], _qr);
    expect(DateTime.tryParse(ingreso['escaneadoEn'] as String), isNotNull);
    expect(find.textContaining('por sincronizar'), findsNothing);
    expect(find.text('Para revisar: no se registraron al sincronizar'), findsOneWidget);
    expect(find.text('CU-002D: Ingreso NO autorizado: esta entrada ya ingresó'), findsOneWidget);
  });

  test('CU-002E: lo pendiente sigue fuera de la lista aunque se descargue de nuevo', () async {
    final local = PuertaLocal(_rock);
    await local.cargar();
    await local.guardarCache({'generadaEn': '2026-11-16T20:00:00.000Z', 'validos': _validos.map(Map.of).toList()});
    expect((await local.ingreso(_qr))!.autorizado, isTrue);

    // Se descarga otra vez (el servidor aún no sabe del ingreso) y se reabre la app.
    await local.guardarCache({'generadaEn': '2026-11-16T20:05:00.000Z', 'validos': _validos.map(Map.of).toList()});
    final reabierta = PuertaLocal(_rock);
    await reabierta.cargar();
    expect(reabierta.pendientes, hasLength(1));
    expect(reabierta.validos, 0);
    expect((await reabierta.ingreso(_qr))!.autorizado, isFalse);
  });
}
