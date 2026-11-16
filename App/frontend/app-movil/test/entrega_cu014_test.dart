import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:hexacore_app/services/pedidos_api.dart';
import 'package:hexacore_app/services/sesion.dart';
import 'package:hexacore_app/widgets/entrega_pedido_panel.dart';
import 'qr_scanner_sheet_test.dart' show CamaraPrueba;

final revision = <String, dynamic>{
  'pedidoId': 'pedido',
  'version': 2,
  'puntoRevision': 'b' * 64,
  'puntoEntrega': 'Puerta uno',
  'total': '1000.25',
  'moneda': 'COP',
  'productos': [
    {'nombreProducto': 'Receta acordada', 'cantidad': 1}
  ]
};
final entregada = <String, dynamic>{
  'id': 'operacion',
  'pedidoId': 'pedido',
  'estadoOperativo': 'ENTREGADO',
  'entrega': {
    'entregadoEn': '2026-11-08T05:00:00Z',
    'puntoEntrega': 'Puerta uno'
  }
};

class ApiEntrega extends PedidosApi {
  int validaciones = 0, confirmaciones = 0;
  final respuesta = Completer<DatosPedido>();
  @override
  Future<DatosPedido?> pendienteEntrega() async => null;
  @override
  Future<DatosPedido> prevalidarEntrega(String local, String codigoQr) async {
    validaciones++;
    expect(codigoQr, 'a' * 64);
    return revision;
  }

  @override
  Future<DatosPedido> confirmarEntrega(
      String local, DatosPedido datos, String codigoQr) async {
    confirmaciones++;
    expect(datos, revision);
    expect(codigoQr, 'a' * 64);
    return respuesta.future;
  }
}

Widget panel(ApiEntrega api, VoidCallback alEntregar) => MaterialApp(
    home: Scaffold(
        body: SingleChildScrollView(
            child: EntregaPedidoPanel(
                api: api,
                local: 'local',
                alEntregar: alEntregar,
                alOcupar: (_) {},
                alPendiente: (_) {}))));
void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));
  testWidgets(
      'entrada manual valida código completo y requiere confirmación y respuesta real del contrato',
      (t) async {
    final api = ApiEntrega();
    var cambios = 0;
    await t.pumpWidget(panel(api, () => cambios++));
    await t.pumpAndSettle();
    await t.tap(find.text('Ingresar código completo'));
    await t.pumpAndSettle();
    await t.enterText(find.byType(TextFormField), '123456');
    await t.tap(find.text('Consultar código'));
    await t.pumpAndSettle();
    expect(api.validaciones, 0);
    expect(
        find.text('Ingresa los 64 caracteres del código QR.'), findsOneWidget);
    await t.enterText(find.byType(TextFormField), 'a' * 64);
    await t.tap(find.text('Consultar código'));
    await t.pumpAndSettle();
    expect(api.validaciones, 1);
    expect(api.confirmaciones, 0);
    expect(find.text('Punto autorizado: Puerta uno'), findsOneWidget);
    await t.ensureVisible(find.text('Confirmar entrega'));
    await t.tap(find.text('Confirmar entrega'));
    await t.pump();
    expect(api.confirmaciones, 1);
    expect(cambios, 0);
    expect(find.byKey(const Key('entrega-confirmada')), findsNothing);
    api.respuesta.complete(entregada);
    await t.pumpAndSettle();
    expect(cambios, 1);
    expect(find.byKey(const Key('entrega-confirmada')), findsOneWidget);
    await t.pumpWidget(const SizedBox.shrink());
  });
  testWidgets(
      'varias detecciones producen una prevalidación y ninguna entrega automática',
      (t) async {
    final anterior = MobileScannerPlatform.instance, camara = CamaraPrueba();
    MobileScannerController.resetPlatformSessionOwner();
    MobileScannerPlatform.instance = camara;
    try {
      t.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
      final api = ApiEntrega();
      await t.pumpWidget(panel(api, () {}));
      await t.pumpAndSettle();
      await t.tap(find.text('Escanear QR del pedido'));
      await t.pumpAndSettle();
      final captura = BarcodeCapture(barcodes: [
        Barcode(rawValue: 'a' * 64, format: BarcodeFormat.qrCode)
      ]);
      for (var n = 0; n < 3; n++) {
        camara.codigos.add(captura);
      }
      await t.pumpAndSettle();
      expect(api.validaciones, 1);
      expect(api.confirmaciones, 0);
      expect(find.text('Confirmar entrega'), findsOneWidget);
      expect(camara.cierres, 1);
      await t.pumpWidget(const SizedBox.shrink());
    } finally {
      await camara.codigos.close();
      MobileScannerPlatform.instance = anterior;
      MobileScannerController.resetPlatformSessionOwner();
    }
  });
  test(
      'respuesta perdida conserva operación sin QR ni credenciales; recuperar sin QR no autoriza localmente',
      () async {
    final sesion = Sesion(almacen: AlmacenMemoria());
    await sesion.abrir(
        tokens: TokensSesion(
            acceso: 'acceso-prueba',
            accesoExpiraEn: DateTime.now().add(const Duration(hours: 1)),
            renovacion: 'renovacion-prueba',
            renovacionExpiraEn: DateTime.now().add(const Duration(days: 1))),
        usuario: const UsuarioSesion(
            id: 'personal-entrega',
            nombre: 'Personal',
            email: 'personal@example.test',
            roles: ['Personal']));
    final api = PedidosApi(
        sesionActual: sesion,
        cliente: MockClient(
            (r) async => throw http.ClientException('Respuesta perdida')));
    await expectLater(api.confirmarEntrega('local', revision, 'a' * 64),
        throwsA(isA<PedidosException>()));
    final i = (await api.pendienteEntrega())!;
    final guardado = (await SharedPreferences.getInstance())
        .getString('hexacore.cu014.intencion.personal-entrega')!;
    expect(guardado, contains(i['id']));
    expect(guardado, isNot(contains('a' * 64)));
    expect(guardado, isNot(contains('acceso-prueba')));
    expect(guardado, isNot(contains('renovacion-prueba')));
    final recuperar = PedidosApi(
        sesionActual: sesion,
        cliente: MockClient((r) async {
          expect(r.headers['Idempotency-Key'], i['id']);
          expect(jsonDecode(r.body),
              {'pedidoId': 'pedido', 'version': 2, 'puntoRevision': 'b' * 64});
          return http.Response(jsonEncode({...entregada, 'id': i['id']}), 200);
        }));
    expect((await recuperar.repetirEntrega(i))['estadoOperativo'], 'ENTREGADO');
    expect(await recuperar.pendienteEntrega(), isNull);
  });
}
