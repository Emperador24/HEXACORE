import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hexacore_app/pages/restaurant_orders_page.dart';
import 'package:hexacore_app/services/pedidos_api.dart';

class BandejaApi extends PedidosApi {
  bool fallar = false;
  final consultados = <String>[];
  @override
  Future<List<DatosPedido>> establecimientos(String evento) async => [
        {'id': 'local-1', 'nombre': 'Restaurante uno'},
        {'id': 'local-2', 'nombre': 'Restaurante dos'}
      ];
  @override
  Future<List<DatosPedido>> recibidos(String local) async {
    consultados.add(local);
    if (fallar) throw Exception('Sin conexión');
    return local == 'local-2'
        ? []
        : [
            {
              'id': 'uuid-interno',
              'estado': 'CONFIRMADO',
              'total': '50000.00',
              'moneda': 'COP',
              'confirmadoEn': '2026-09-22T12:00:00Z',
              'productos': [
                {'nombreProducto': 'Hamburguesa real', 'cantidad': 2}
              ]
            }
          ];
  }
}

void main() {
  testWidgets(
      'muestra pedidos reales y cambia de establecimiento sin acciones de otros CU',
      (tester) async {
    final api = BandejaApi();
    await tester.pumpWidget(
        MaterialApp(home: Scaffold(body: RestaurantOrdersPage(api: api))));
    await tester.pumpAndSettle();
    expect(find.text('2 × Hamburguesa real'), findsOneWidget);
    expect(find.text('Pedido confirmado'), findsOneWidget);
    expect(find.textContaining('50.000'), findsOneWidget);
    expect(find.text('uuid-interno'), findsNothing);
    expect(find.byIcon(Icons.qr_code_scanner), findsNothing);
    await tester.tap(find.byType(DropdownButtonFormField<String>));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Restaurante dos').last);
    await tester.pumpAndSettle();
    expect(api.consultados, ['local-1', 'local-2']);
    expect(
        find.textContaining('Aún no hay pedidos confirmados'), findsOneWidget);
    expect(find.text('2 × Hamburguesa real'), findsNothing);
  });
  testWidgets('error y reintento consultan otra vez el backend',
      (tester) async {
    final api = BandejaApi()..fallar = true;
    await tester.pumpWidget(
        MaterialApp(home: Scaffold(body: RestaurantOrdersPage(api: api))));
    await tester.pumpAndSettle();
    expect(find.textContaining('No pudimos consultar'), findsOneWidget);
    api.fallar = false;
    await tester.tap(find.text('Reintentar'));
    await tester.pumpAndSettle();
    expect(find.text('2 × Hamburguesa real'), findsOneWidget);
  });
}
