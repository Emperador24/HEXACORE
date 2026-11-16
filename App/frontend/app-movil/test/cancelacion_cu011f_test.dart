import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:hexacore_app/services/pedidos_api.dart';
import 'package:hexacore_app/services/sesion.dart';
import 'package:hexacore_app/widgets/cancelacion_pedido_panel.dart';

Future<Sesion> cuenta() async {
  final s = Sesion(almacen: AlmacenMemoria());
  await s.abrir(
      tokens: TokensSesion(
          acceso: 'acceso-cu011f',
          accesoExpiraEn: DateTime.now().add(const Duration(hours: 1)),
          renovacion: 'renovacion-cu011f',
          renovacionExpiraEn: DateTime.now().add(const Duration(days: 1))),
      usuario: const UsuarioSesion(
          id: 'personal-cu011f',
          nombre: 'Personal',
          email: 'fixture@example.test',
          roles: ['Personal']));
  return s;
}

final resultado = <String, dynamic>{
  'pedidoId': 'pedido',
  'operacionId': 'op',
  'motivo': 'No se puede preparar',
  'canceladoEn': '2026-11-11T22:00:00Z',
  'inventario': 'NO_REINCORPORAR',
  'reembolso': {
    'estado': 'INCIERTO',
    'monto': '1000.25',
    'moneda': 'COP',
    'referencia': null
  }
};

class ApiCancelacion extends PedidosApi {
  final datosRecibidos = <DatosPedido>[];
  @override
  Future<DatosPedido?> pendienteCancelacion() async => null;
  @override
  Future<DatosPedido> cancelarPedido(
      String local, String pedido, DatosPedido datos) async {
    datosRecibidos.add(datos);
    return resultado;
  }

  @override
  Future<DatosPedido> consultarCancelacion(String local, String pedido) async =>
      resultado;
}

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));
  test(
      'respuesta perdida conserva UUID, versión, motivo y confirmación sin guardar tokens',
      () async {
    final s = await cuenta();
    final api = PedidosApi(
        sesionActual: s,
        cliente: MockClient(
            (r) async => throw http.ClientException('sin respuesta')));
    final datos = {
      'version': 0,
      'motivo': 'No se puede preparar',
      'confirmar': true
    };
    await expectLater(api.cancelarPedido('local', 'pedido', datos),
        throwsA(isA<PedidosException>()));
    final i = (await api.pendienteCancelacion())!;
    final raw = (await SharedPreferences.getInstance())
        .getString('hexacore.cu011f.intencion.personal-cu011f')!;
    expect(raw, isNot(contains('acceso-cu011f')));
    expect(raw, isNot(contains('renovacion-cu011f')));
    expect(raw, isNot(contains('codigoQr')));
    final consultas = <http.Request>[];
    final recuperacion = PedidosApi(
        sesionActual: s,
        cliente: MockClient((r) async {
          consultas.add(r);
          expect(r.headers['Idempotency-Key'], i['id']);
          expect(jsonDecode(r.body), datos);
          expect(r.url.path,
              endsWith('/establecimientos/local/pedidos/pedido/cancelacion'));
          return http.Response(jsonEncode(resultado), 200);
        }));
    await recuperacion.repetirCancelacion(i);
    expect(consultas, hasLength(1));
    expect(await recuperacion.pendienteCancelacion(), isNull);
  });
  test('una intención pendiente impide sustituirla por otra clave o datos',
      () async {
    final s = await cuenta();
    var solicitudes = 0;
    final api = PedidosApi(
        sesionActual: s,
        cliente: MockClient((r) async {
          solicitudes++;
          throw http.ClientException('sin respuesta');
        }));
    await expectLater(
        api.cancelarPedido('local', 'pedido',
            {'version': 0, 'motivo': 'Motivo original', 'confirmar': true}),
        throwsA(isA<PedidosException>()));
    await expectLater(
        api.cancelarPedido('otro', 'otro',
            {'version': 1, 'motivo': 'Otro motivo', 'confirmar': true}),
        throwsA(isA<PedidosException>()));
    expect(solicitudes, 1);
    expect((await api.pendienteCancelacion())!['local'], 'local');
  });
  test('consulta del resultado es GET sin otro reembolso ni cuerpo financiero',
      () async {
    final s = await cuenta();
    final api = PedidosApi(
        sesionActual: s,
        cliente: MockClient((r) async {
          expect(r.method, 'GET');
          expect(r.body, isEmpty);
          expect(r.url.path, endsWith('/cancelacion'));
          return http.Response(jsonEncode(resultado), 200);
        }));
    expect(
        (await api.consultarCancelacion('local', 'pedido'))['reembolso']
            ['estado'],
        'INCIERTO');
  });
  testWidgets(
      'Personal exige motivo y checkbox antes de cancelar; muestra incertidumbre sin devolución confirmada',
      (t) async {
    final api = ApiCancelacion();
    await t.pumpWidget(MaterialApp(
        home: Scaffold(
            body: SingleChildScrollView(
                child: CancelacionPedidoPanel(
                    api: api,
                    local: 'local',
                    pedido: const {
                      'id': 'pedido',
                      'estado': 'CONFIRMADO',
                      'pagoVerificado': true,
                      'preparacion': {'version': 0}
                    },
                    alCambiar: () {},
                    alOcupar: (_) {},
                    alPendiente: (_) {})))));
    await t.pumpAndSettle();
    await t.tap(find.text('Cancelar pedido'));
    await t.pumpAndSettle();
    expect(
        t
            .widget<FilledButton>(
                find.widgetWithText(FilledButton, 'Confirmar cancelación'))
            .onPressed,
        isNull);
    await t.enterText(find.byType(TextFormField), 'No se puede preparar');
    await t.tap(find.byType(Checkbox));
    await t.pumpAndSettle();
    await t.tap(find.text('Confirmar cancelación'));
    await t.pumpAndSettle();
    expect(api.datosRecibidos.single,
        {'version': 0, 'motivo': 'No se puede preparar', 'confirmar': true});
    expect(find.textContaining('Reembolso incierto'), findsOneWidget);
    expect(
        find.text(
            'No se confirma dinero devuelto. El pedido permanece cancelado.'),
        findsOneWidget);
    expect(find.text('La pasarela confirmó la aprobación del reembolso total.'),
        findsNothing);
  });
  for (final estado in ['PENDIENTE', 'RECHAZADO', 'INCIERTO', 'APROBADO']) {
    testWidgets(
        'presenta el estado real $estado en el resumen compartido con cliente',
        (t) async {
      final c = {
        ...resultado,
        'reembolso': {
          'estado': estado,
          'monto': '1000.25',
          'moneda': 'COP',
          'referencia': estado == 'APROBADO' ? 'ree_confirmada' : null
        }
      };
      await t.pumpWidget(MaterialApp(
          home: Scaffold(body: Column(children: resumenCancelacion(c)))));
      expect(find.textContaining('Reembolso ${estadoReembolsoPedido(estado)}'),
          findsOneWidget);
      expect(
          find.text('La pasarela confirmó la aprobación del reembolso total.'),
          estado == 'APROBADO' ? findsOneWidget : findsNothing);
    });
  }
}
