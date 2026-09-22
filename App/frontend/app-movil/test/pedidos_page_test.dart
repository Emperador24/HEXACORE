import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:qr_flutter/qr_flutter.dart';
import 'package:hexacore_app/pages/pedidos_page.dart';
import 'package:hexacore_app/services/pedidos_api.dart';

class CatalogoPrueba extends PedidosApi {
  int cobros = 0;
  @override
  Future<List<DatosPedido>> establecimientos(String e) async => [
        {
          'id': 'uuid-local',
          'nombre': 'Restaurante',
          'puntoEntrega': 'Módulo 4'
        }
      ];
  @override
  Future<List<DatosPedido>> productos(String e) async => [
        {
          'id': 'uuid-producto',
          'nombre': 'Hamburguesa',
          'precio': '25000.00',
          'activo': true,
          'cantidadInventario': 20
        },
        {
          'id': 'uuid-agotado',
          'nombre': 'Jugo',
          'precio': '7000.00',
          'activo': true,
          'cantidadInventario': 0
        },
      ];
  @override
  Future<DatosPedido> checkout(
          String e, String l, Map<String, int> cantidades) async =>
      {
        'id': 'uuid-pedido',
        'total': '25000.00',
        'moneda': 'COP',
        'expiraEn':
            DateTime.now().add(const Duration(minutes: 10)).toIso8601String(),
        'detalles': [
          {
            'nombreProducto': 'Hamburguesa',
            'cantidad': cantidades['uuid-producto'],
            'precioUnitario': '25000.00'
          }
        ],
      };
  @override
  Future<DatosPedido> pagar(String p, String c) async {
    cobros++;
    return {
      'estadoPago': 'APROBADA',
      'compraConfirmada': true,
      'monto': '25000.00',
      'moneda': 'COP',
      'codigoQr': 'qr-exacto-del-backend'
    };
  }
}

void main() {
  testWidgets('catálogo a confirmación y QR local sin UUID visibles',
      (tester) async {
    final api = CatalogoPrueba();
    await tester
        .pumpWidget(MaterialApp(home: Scaffold(body: PedidosPage(api: api))));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Restaurante'));
    await tester.pumpAndSettle();
    expect(find.text('uuid-local'), findsNothing);
    expect(find.text('Agotado'), findsOneWidget);
    await tester.tap(find.byTooltip('Agregar Hamburguesa'));
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('Continuar'));
    await tester.tap(find.text('Continuar'));
    await tester.pumpAndSettle();
    expect(find.text('Pendiente de pago'), findsOneWidget);
    expect(find.text('uuid-pedido'), findsNothing);
    await tester.ensureVisible(find.text('Pagar pedido'));
    await tester.tap(find.text('Pagar pedido'));
    await tester.pumpAndSettle();
    expect(find.text('¡Compra confirmada!'), findsOneWidget);
    expect(find.byType(QrImageView), findsOneWidget);
    expect(tester.widget<QrImageView>(find.byType(QrImageView)).backgroundColor,
        Colors.white);
    expect(find.text('qr-exacto-del-backend'), findsNothing);
    expect(api.cobros, 1);
  });
}
