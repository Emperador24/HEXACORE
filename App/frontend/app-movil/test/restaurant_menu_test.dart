import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hexacore_app/pages/restaurant_menu_page.dart';
import 'package:hexacore_app/services/pedidos_api.dart';

class MenuApi extends PedidosApi {
  bool errorLectura = false, errorCambio = false;
  Completer<DatosPedido>? pendiente;
  final cambios = <List<Object>>[];
  @override
  Future<List<DatosPedido>> establecimientos(String evento) async => [
        {'id': 'uno', 'nombre': 'Restaurante uno'},
        {'id': 'dos', 'nombre': 'Restaurante dos'}
      ];
  @override
  Future<List<DatosPedido>> menu(String establecimiento) async {
    if (errorLectura) throw Exception('Error');
    return establecimiento == 'dos'
        ? []
        : [
            producto(true),
            {...producto(false), 'id': 'otro', 'nombre': 'Gaseosa'}
          ];
  }

  DatosPedido producto(bool activo) => {
        'id': 'producto',
        'nombre': 'Hamburguesa',
        'precio': '25000.00',
        'activo': activo
      };
  @override
  Future<DatosPedido> actualizarDisponibilidad(
      String local, String productoId, bool activo) async {
    cambios.add([local, productoId, activo]);
    if (errorCambio) throw Exception('Error');
    return pendiente == null
        ? {...producto(activo), 'id': productoId}
        : await pendiente!.future;
  }
}

Future<void> abrir(WidgetTester tester, MenuApi api) async {
  await tester.pumpWidget(
      MaterialApp(home: Scaffold(body: RestaurantMenuPage(api: api))));
  await tester.pumpAndSettle();
}

void main() {
  testWidgets('lista activos/inactivos y permite seleccionar establecimiento',
      (tester) async {
    await abrir(tester, MenuApi());
    expect(find.text('Hamburguesa'), findsOneWidget);
    expect(find.text('Gaseosa'), findsOneWidget);
    expect(tester.widgetList<Switch>(find.byType(Switch)).map((s) => s.value),
        [true, false]);
    await tester.tap(find.byType(DropdownButtonFormField<String>));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Restaurante dos').last);
    await tester.pumpAndSettle();
    expect(find.text('Este establecimiento aún no tiene productos.'),
        findsOneWidget);
  });
  testWidgets('guarda, bloquea mientras espera y usa la respuesta del servidor',
      (tester) async {
    final api = MenuApi()..pendiente = Completer<DatosPedido>();
    await abrir(tester, api);
    await tester.tap(find.byType(Switch).first);
    await tester.pump();
    expect(find.byType(LinearProgressIndicator), findsOneWidget);
    expect(tester.widget<Switch>(find.byType(Switch).first).onChanged, isNull);
    expect(api.cambios, [
      ['uno', 'producto', false]
    ]);
    api.pendiente!.complete(api.producto(false));
    await tester.pumpAndSettle();
    expect(tester.widget<Switch>(find.byType(Switch).first).value, false);
    expect(find.text('Disponibilidad actualizada.'), findsOneWidget);
    api.pendiente = null;
    await tester.tap(find.byType(Switch).first);
    await tester.pumpAndSettle();
    expect(tester.widget<Switch>(find.byType(Switch).first).value, true);
  });
  testWidgets('fallo al guardar conserva el estado y muestra error',
      (tester) async {
    await abrir(tester, MenuApi()..errorCambio = true);
    await tester.tap(find.byType(Switch).first);
    await tester.pumpAndSettle();
    expect(tester.widget<Switch>(find.byType(Switch).first).value, true);
    expect(
        find.textContaining('No pudimos confirmar el cambio'), findsOneWidget);
  });
  testWidgets('error de carga permite reintentar', (tester) async {
    final api = MenuApi()..errorLectura = true;
    await abrir(tester, api);
    expect(find.textContaining('No pudimos cargar el menú'), findsOneWidget);
    api.errorLectura = false;
    await tester.tap(find.text('Reintentar'));
    await tester.pumpAndSettle();
    expect(find.text('Hamburguesa'), findsOneWidget);
  });
}
