import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:qr_flutter/qr_flutter.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:hexacore_app/pages/restaurant_orders_page.dart';
import 'package:hexacore_app/pages/seguimiento_pedidos_page.dart';
import 'package:hexacore_app/services/pedidos_api.dart';
import 'package:hexacore_app/services/sesion.dart';

class ApiPreparacion extends PedidosApi {
  int version = 0, lecturas = 0;
  bool fallar = false;
  String estado = 'RECIBIDO';
  final operaciones = <DatosPedido>[];
  final qrsConsultados = <String>[];
  DatosPedido get pedido => {
        'id': 'pedido-propio',
        'estado': 'CONFIRMADO',
        'total': '1000.25',
        'moneda': 'COP',
        'pagoVerificado': true,
        'establecimiento': 'Local cerrado',
        'puntoEntrega': 'Puerta uno',
        'codigoQr': 'qr-durable',
        'productos': [
          {
            'nombreProducto': 'Receta acordada',
            'cantidad': 1,
            'precioUnitario': '1000.25'
          }
        ],
        'preparacion': {
          'estado': estado,
          'version': version,
          'incidenciasAbiertas': 0,
          'estimadoListoEn':
              estado == 'RECIBIDO' ? null : '2026-11-07T20:00:00Z'
        },
        'incidencias': <dynamic>[],
        'historial': <dynamic>[],
        'avisos': [
          if (version > 0)
            {
              'mensaje': 'Tu pedido está en preparación.',
              'creadoEn': '2026-11-07T19:00:00Z'
            }
        ],
      };
  @override
  Future<DatosPedido?> pendienteEntrega() async => null;
  @override
  Future<DatosPedido?> pendientePreparacion() async => null;
  @override
  Future<List<DatosPedido>> misEstablecimientos() async => [
        {'id': 'local', 'nombre': 'Local cerrado', 'estado': 'CERRADO'}
      ];
  @override
  Future<List<DatosPedido>> recibidos(String local, {int pagina = 0}) async {
    lecturas++;
    if (fallar) throw PedidosException('Sin conexión', 0);
    return [pedido];
  }

  @override
  Future<DatosPedido> detalleRecibido(String local, String id) async => pedido;
  @override
  Future<DatosPedido> operarPreparacion(
      String local, String pedido, DatosPedido datos,
      {String? clave}) async {
    operaciones.add(datos);
    if (datos['version'] != version) {
      throw PedidosException('El pedido cambió. Actualiza la bandeja.', 409);
    }
    version++;
    estado = 'EN_PREPARACION';
    return {'id': 'operacion', 'preparacion': this.pedido['preparacion']};
  }

  @override
  Future<List<DatosPedido>> misPedidos({int pagina = 0}) async {
    lecturas++;
    if (fallar) throw PedidosException('Sin conexión', 0);
    return [pedido];
  }

  @override
  Future<DatosPedido> seguimiento(String id) async {
    qrsConsultados.add(pedido['codigoQr'] as String);
    return pedido;
  }
}

class ApiBandejaLarga extends ApiPreparacion {
  @override
  Future<List<DatosPedido>> misPedidos({int pagina = 0}) async => List.generate(
      100, (i) => {...pedido, 'id': i == 0 ? 'pedido-propio' : 'anterior-$i'});
}

class ApiPaginas extends ApiPreparacion {
  List<DatosPedido> lista(int pagina) => pagina == 0
      ? List.generate(100, (i) => {...pedido, 'id': 'reciente-$i'})
      : [
          {
            ...pedido,
            'id': 'historico',
            'establecimiento': 'Histórico recuperado',
            'productos': <dynamic>[]
          }
        ];
  @override
  Future<List<DatosPedido>> misPedidos({int pagina = 0}) async => lista(pagina);
  @override
  Future<List<DatosPedido>> recibidos(String local, {int pagina = 0}) async =>
      lista(pagina);
}

Finder campo(String etiqueta) => find.ancestor(
    of: find.text(etiqueta), matching: find.byType(TextFormField));
void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));
  for (final personal in [false, true]) {
    testWidgets(
        'recupera pedidos anteriores en ${personal ? "Personal" : "Cliente"}',
        (t) async {
      final api = ApiPaginas();
      await t.pumpWidget(MaterialApp(
          home: Scaffold(
              body: personal
                  ? RestaurantOrdersPage(api: api)
                  : MisPedidosPage(api: api))));
      await t.pumpAndSettle();
      await t.tap(find.text('Pedidos anteriores'));
      await t.pumpAndSettle();
      expect(find.text('Página 2'), findsOneWidget);
      if (personal) expect(find.text('Gestionar pedido'), findsOneWidget);
      if (!personal) expect(find.text('Histórico recuperado'), findsOneWidget);
      await t.tap(find.text('Pedidos más recientes'));
      await t.pumpAndSettle();
      expect(find.text('Página 1'), findsOneWidget);
      await t.pumpWidget(const SizedBox.shrink());
    });
  }
  testWidgets(
      'bandeja privada incluye cerrado, valida minutos y conserva la versión del formulario',
      (tester) async {
    final api = ApiPreparacion();
    await tester.pumpWidget(
        MaterialApp(home: Scaffold(body: RestaurantOrdersPage(api: api))));
    await tester.pumpAndSettle();
    expect(find.text('Local cerrado'), findsOneWidget);
    expect(find.byType(QrImageView), findsNothing);
    await tester.ensureVisible(find.text('Gestionar pedido'));
    await tester.tap(find.text('Gestionar pedido'));
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('Iniciar preparación'));
    await tester.tap(find.text('Iniciar preparación'));
    await tester.pumpAndSettle();
    final previas = api.lecturas;
    await tester.pump(const Duration(seconds: 30));
    expect(api.lecturas, previas);
    await tester.enterText(campo('Minutos estimados'), '0');
    await tester.tap(find.text('Guardar avance'));
    await tester.pumpAndSettle();
    expect(find.text('Indica un entero entre 1 y 240.'), findsOneWidget);
    await tester.enterText(campo('Minutos estimados'), '12');
    api.version = 5;
    await tester.tap(find.text('Guardar avance'));
    await tester.pumpAndSettle();
    expect(api.operaciones.single,
        {'accion': 'INICIAR', 'version': 0, 'minutos': 12});
    expect(api.version, 5);
    expect(find.textContaining('El pedido cambió'), findsOneWidget);
    await tester.pumpWidget(const SizedBox.shrink());
  });
  testWidgets(
      'cliente recupera el mismo QR y avisos; el sondeo se pausa ante error y termina al salir',
      (tester) async {
    final api = ApiPreparacion();
    await tester.pumpWidget(MaterialApp(
        home: Scaffold(
            body: MisPedidosPage(api: api, pedidoId: 'pedido-propio'))));
    await tester.pumpAndSettle();
    expect(find.byType(QrImageView), findsOneWidget);
    expect(api.qrsConsultados, ['qr-durable']);
    api.version = 1;
    api.estado = 'EN_PREPARACION';
    await tester.pump(const Duration(seconds: 15));
    await tester.pumpAndSettle();
    expect(
        find.textContaining('Tu pedido está en preparación.'), findsOneWidget);
    expect(find.byType(QrImageView), findsOneWidget);
    expect(api.qrsConsultados, ['qr-durable', 'qr-durable']);
    api.fallar = true;
    await tester.pump(const Duration(seconds: 15));
    await tester.pumpAndSettle();
    final pausadas = api.lecturas;
    await tester.pump(const Duration(seconds: 45));
    expect(api.lecturas, pausadas);
    await tester.pumpWidget(const SizedBox.shrink());
    await tester.pump(const Duration(seconds: 45));
    expect(api.lecturas, pausadas);
  });
  testWidgets(
      'el enlace a un pedido muestra su QR antes de una bandeja de cien pedidos',
      (tester) async {
    await tester.pumpWidget(MaterialApp(
        home: Scaffold(
            body: MisPedidosPage(
                api: ApiBandejaLarga(), pedidoId: 'pedido-propio'))));
    await tester.pumpAndSettle();
    expect(find.byType(QrImageView).hitTestable(), findsOneWidget);
    await tester.pumpWidget(const SizedBox.shrink());
  });

  test(
      'respuesta perdida conserva UUID y versión, replay no guarda credenciales y 409 permite actualizar',
      () async {
    final sesion = Sesion(almacen: AlmacenMemoria());
    await sesion.abrir(
        tokens: TokensSesion(
            acceso: 'acceso-prueba',
            accesoExpiraEn: DateTime.now().add(const Duration(hours: 1)),
            renovacion: 'renovacion-prueba',
            renovacionExpiraEn: DateTime.now().add(const Duration(days: 1))),
        usuario: const UsuarioSesion(
            id: 'personal',
            nombre: 'Personal',
            email: 'prueba@example.com',
            roles: ['Personal']));
    final primera = PedidosApi(
        sesionActual: sesion,
        cliente: MockClient(
            (r) async => throw http.ClientException('Respuesta perdida')));
    final datos = {'accion': 'INICIAR', 'version': 0, 'minutos': 12};
    await expectLater(primera.operarPreparacion('local', 'pedido', datos),
        throwsA(isA<PedidosException>()));
    final pendiente = (await primera.pendientePreparacion())!;
    final valor = (await SharedPreferences.getInstance())
        .getString('hexacore.cu013.intencion.personal')!;
    expect(valor, contains('"version":0'));
    expect(valor, isNot(contains('acceso-prueba')));
    expect(valor, isNot(contains('renovacion-prueba')));
    final segunda = PedidosApi(
        sesionActual: sesion,
        cliente: MockClient((r) async {
          expect(r.headers['Idempotency-Key'], pendiente['id']);
          expect(jsonDecode(r.body), datos);
          expect(r.url.path,
              endsWith('/establecimientos/local/pedidos/pedido/preparacion'));
          return http.Response(
              jsonEncode({
                'id': pendiente['id'],
                'preparacion': {'estado': 'EN_PREPARACION', 'version': 1}
              }),
              200);
        }));
    await segunda.repetirPreparacion(pendiente);
    expect(await segunda.pendientePreparacion(), isNull);
    final obsoleta = PedidosApi(
        sesionActual: sesion,
        cliente: MockClient((r) async => http.Response(
            jsonEncode({
              'codigo': 'VERSION_PREPARACION_DESACTUALIZADA',
              'message': 'El pedido cambió.'
            }),
            409,
            headers: {'content-type': 'application/json; charset=utf-8'})));
    await expectLater(
        obsoleta.operarPreparacion('local', 'pedido', datos),
        throwsA(
            isA<PedidosException>().having((e) => e.estado, 'estado', 409)));
    expect(await obsoleta.pendientePreparacion(), isNull);
  });
}
