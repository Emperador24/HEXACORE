import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hexacore_app/pages/entradas_page.dart';
import 'package:hexacore_app/services/boleteria_api.dart';
import 'package:hexacore_app/services/sesion.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';

const _evento = 'e0000000-0000-4000-8000-000000000001';
const _localidad = 'l0000000-0000-4000-8000-000000000001';
const _compra = 'c0000000-0000-4000-8000-000000000001';

Future<Sesion> sesionCliente() async {
  final s = Sesion(almacen: AlmacenMemoria());
  await s.abrir(
      tokens: TokensSesion(
          acceso: 'token',
          accesoExpiraEn: DateTime.now().add(const Duration(hours: 1)),
          renovacion: 'renovacion',
          renovacionExpiraEn: DateTime.now().add(const Duration(days: 1))),
      usuario: const UsuarioSesion(id: 'cliente', nombre: 'Ana', email: 'a@b.co', roles: ['Cliente']));
  return s;
}

Map<String, dynamic> compra({String estado = 'PENDIENTE', num total = 160000, num descuento = 0, String? codigo}) => {
      'id': _compra,
      'numeroCompra': 'HXC-0001',
      'estado': estado,
      'eventoId': _evento,
      'localidadId': _localidad,
      'cantidad': 2,
      'precioUnitario': 80000,
      'subtotal': 160000,
      'descuento': descuento,
      'total': total,
      'codigoPromocional': codigo,
      'expiraEn': DateTime.now().add(const Duration(minutes: 10)).toUtc().toIso8601String(),
      'pagadaEn': null,
      'motivo': null,
      'entradas': estado == 'PAGADA'
          ? [
              {'id': 't1', 'numeroTicket': 'TCK-1', 'codigoQr': 'QR-UNO', 'localidadNombre': 'General', 'estado': 'VALIDA', 'precioPagado': 72000},
              {'id': 't2', 'numeroTicket': 'TCK-2', 'codigoQr': 'QR-DOS', 'localidadNombre': 'General', 'estado': 'VALIDA', 'precioPagado': 72000},
            ]
          : [],
    };

final _detalle = {
  'id': _evento,
  'nombre': 'HEXACORE Fest',
  'categoria': 'Concierto',
  'fechaInicio': '2026-12-12T01:00:00.000Z',
  'lugar': 'Movistar Arena',
  'ciudad': 'Bogotá',
  'imagenUrl': null,
  'precioDesde': 80000,
  'agotado': false,
  'pasado': false,
  'localidades': [
    {'id': _localidad, 'nombre': 'General', 'precio': 80000, 'disponibles': 50, 'agotada': false},
    {'id': 'agotada', 'nombre': 'VIP', 'precio': 300000, 'disponibles': 0, 'agotada': true},
  ],
};

http.Response json(Object cuerpo, [int estado = 200]) =>
    http.Response.bytes(utf8.encode(jsonEncode(cuerpo)), estado, headers: {'content-type': 'application/json'});

/// Deja correr las peticiones simuladas y los rebuilds sin esperar a que se
/// asienten las animaciones de fondo.
/// Pantalla de teléfono alta para que la lista construya todos sus botones.
void pantallaTelefono(WidgetTester tester) {
  tester.view.physicalSize = const Size(1080, 3200);
  tester.view.devicePixelRatio = 2;
  addTearDown(tester.view.reset);
}

Future<void> avanzar(WidgetTester tester, [int veces = 6]) async {
  for (var i = 0; i < veces; i++) {
    await tester.pump(const Duration(milliseconds: 100));
  }
}

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));

  test('la compra pasa por la Cola virtual y no envía precio: lo pone el servidor', () async {
    final peticiones = <http.Request>[];
    var intentosTurno = 0;
    final api = BoleteriaApi(
      sesionActual: await sesionCliente(),
      esperaEntreTurnos: Duration.zero,
      cliente: MockClient((r) async {
        peticiones.add(r);
        expect(r.headers['Authorization'], 'Bearer token');
        if (r.url.path == '/api/v1/cola/eventos/$_evento/turnos') {
          intentosTurno++;
          return intentosTurno == 1
              ? json({'estado': 'EN_ESPERA', 'token': null, 'posicion': 3, 'reintentarEnSegundos': 1})
              : json({'estado': 'ADMITIDO', 'token': 'turno-1', 'posicion': 0, 'reintentarEnSegundos': null});
        }
        if (r.url.path == '/api/v1/compras' && r.method == 'POST') return json(compra(), 201);
        return json({}, 404);
      }),
    );
    final posiciones = <int>[];
    final c = await api.reservar(_evento, _localidad, 2, enEspera: posiciones.add);

    expect(c['total'], 160000);
    expect(posiciones, [3]);
    final reserva = peticiones.last;
    expect(reserva.headers['X-Turno-Cola'], 'turno-1');
    expect(jsonDecode(reserva.body), {'localidadId': _localidad, 'cantidad': 2});
  });

  test('los errores conservan el código del camino del caso de uso (CU-004C)', () async {
    final api = BoleteriaApi(
      sesionActual: await sesionCliente(),
      cliente: MockClient((r) async {
        expect(r.method, 'PUT');
        expect(r.url.path, '/api/v1/compras/$_compra/cupon');
        expect(jsonDecode(r.body), {'codigo': 'NOEXISTE'});
        return json({'codigo': 'CU-004C', 'mensaje': 'El código promocional no existe'}, 422);
      }),
    );
    await expectLater(
      api.aplicarCupon(_compra, '  NOEXISTE '),
      throwsA(isA<BoleteriaApiException>()
          .having((e) => e.codigo, 'codigo', 'CU-004C')
          .having((e) => e.mensaje, 'mensaje', 'El código promocional no existe')),
    );
  });

  testWidgets('CU-001/CU-004: elegir, apartar, aplicar código, pagar y ver el QR', (tester) async {
    pantallaTelefono(tester);
    final rutas = <String>[];
    Map<String, dynamic>? cuerpoPago;
    final api = BoleteriaApi(
      sesionActual: await sesionCliente(),
      esperaEntreTurnos: Duration.zero,
      cliente: MockClient((r) async {
        rutas.add('${r.method} ${r.url.path}');
        switch ('${r.method} ${r.url.path}') {
          case 'GET /api/v1/cartelera/$_evento':
            return json(_detalle);
          case 'POST /api/v1/cola/eventos/$_evento/turnos':
            return json({'estado': 'ADMITIDO', 'token': 'turno-1'});
          case 'POST /api/v1/compras':
            return json(compra(), 201);
          case 'PUT /api/v1/compras/$_compra/cupon':
            return json(compra(total: 144000, descuento: 16000, codigo: 'HEXA10'));
          case 'POST /api/v1/compras/$_compra/pagar':
            cuerpoPago = jsonDecode(r.body) as Map<String, dynamic>;
            return json(compra(estado: 'PAGADA', total: 144000, descuento: 16000, codigo: 'HEXA10'));
        }
        return json({'mensaje': 'no esperado'}, 500);
      }),
    );

    await tester.pumpWidget(MaterialApp(home: CompraEntradasPage(eventoId: _evento, nombre: 'HEXACORE Fest', api: api)));
    await avanzar(tester);
    expect(find.text('General'), findsOneWidget);
    expect(find.text('Agotada'), findsOneWidget);

    await tester.tap(find.byTooltip('Más'));
    await avanzar(tester, 2);
    await tester.tap(find.text('Continuar al pago'));
    await avanzar(tester);
    expect(find.text('Resumen de la compra'), findsOneWidget);
    expect(find.text('\$160.000'), findsWidgets);

    await tester.enterText(find.byType(TextField), 'HEXA10');
    await tester.tap(find.text('Aplicar'));
    await avanzar(tester);
    expect(find.textContaining('HEXA10 aplicado'), findsOneWidget);
    expect(find.text('\$144.000'), findsOneWidget);

    await tester.ensureVisible(find.text('Confirmar pago'));
    await tester.tap(find.text('Confirmar pago'));
    await avanzar(tester);
    expect(find.text('¡Compra confirmada!'), findsOneWidget);
    expect(find.text('QR-UNO'), findsOneWidget);
    expect(cuerpoPago, {'metodoPago': 'TARJETA', 'token': 'tok_ok_movil'});
    expect(rutas.where((r) => r.startsWith('POST /api/v1/compras/')), contains('POST /api/v1/compras/$_compra/pagar'));

    await tester.pumpWidget(const SizedBox());
  });

  testWidgets('CU-003: cotiza, pide motivo y cancela con el monto que vio la persona', (tester) async {
    pantallaTelefono(tester);
    Map<String, dynamic>? cuerpoCancelacion;
    var cancelada = false;
    final api = BoleteriaApi(
      sesionActual: await sesionCliente(),
      cliente: MockClient((r) async {
        switch ('${r.method} ${r.url.path}') {
          case 'GET /api/v1/compras/$_compra':
            final c = compra(estado: cancelada ? 'CANCELADA' : 'PAGADA');
            if (cancelada) {
              for (final e in c['entradas'] as List) {
                (e as Map)['estado'] = 'ANULADA';
              }
            }
            return json(c);
          case 'POST /api/v1/compras/$_compra/cancelacion/cotizacion':
            return json({
              'entradasCancelables': ['t1', 't2'],
              'entradasRechazadas': [],
              'montoPagado': 144000,
              'porcentajeReembolso': 80,
              'montoReembolso': 115200,
              'parcial': true,
              'tramo': 'PARCIAL',
              'mensaje': 'Se devuelve el 80 %.',
            });
          case 'POST /api/v1/compras/$_compra/cancelaciones':
            cuerpoCancelacion = jsonDecode(r.body) as Map<String, dynamic>;
            cancelada = true;
            return json({'montoReembolso': 115200, 'mensaje': 'Reembolso aprobado por 115200 COP.'});
        }
        return json({'mensaje': 'no esperado'}, 500);
      }),
    );

    await tester.pumpWidget(MaterialApp(home: DetalleCompraPage(compraId: _compra, nombreEvento: 'HEXACORE Fest', api: api)));
    await avanzar(tester);
    expect(find.text('QR-UNO'), findsOneWidget);

    await tester.ensureVisible(find.text('Cancelar toda la compra'));
    await tester.tap(find.text('Cancelar toda la compra'));
    await avanzar(tester);
    expect(find.text('Se devuelve el 80 %.'), findsOneWidget);
    expect(find.textContaining('\$115.200'), findsOneWidget);

    await tester.enterText(find.widgetWithText(TextField, 'Motivo (obligatorio)'), 'No puedo asistir');
    await avanzar(tester, 2);
    await tester.tap(find.text('Confirmar cancelación'));
    await avanzar(tester);

    expect(cuerpoCancelacion, {'motivo': 'No puedo asistir', 'montoAceptado': 115200});
    expect(find.text('Reembolso aprobado por 115200 COP.'), findsOneWidget);
    expect(find.text('QR-UNO'), findsNothing);
  });
}
