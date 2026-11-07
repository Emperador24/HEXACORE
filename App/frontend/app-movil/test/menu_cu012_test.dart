import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:hexacore_app/pages/restaurant_menu_page.dart';
import 'package:hexacore_app/services/pedidos_api.dart';
import 'package:hexacore_app/services/sesion.dart';

Finder campo(String nombre) =>
    find.ancestor(of: find.text(nombre), matching: find.byType(TextFormField));

void main() {
  setUp(() => SharedPreferences.setMockInitialValues({}));
  testWidgets(
      'producto exige nombre, decimal textual y cantidad válida y entrega el contrato CU012',
      (tester) async {
    DatosPedido? resultado;
    await tester.pumpWidget(MaterialApp(
        home: Builder(
            builder: (context) => Scaffold(
                body: TextButton(
                    onPressed: () async {
                      resultado = await showDialog<DatosPedido>(
                          context: context,
                          builder: (_) => const FormularioProductoMenu());
                    },
                    child: const Text('Abrir'))))));
    await tester.tap(find.text('Abrir'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Guardar producto'));
    await tester.pumpAndSettle();
    expect(find.text('Completa el nombre.'), findsOneWidget);
    expect(find.text('Precio decimal positivo, máximo dos decimales.'),
        findsOneWidget);
    await tester.enterText(campo('Nombre del producto'), 'Producto nativo');
    await tester.enterText(campo('Precio COP'), '9999999999.99');
    await tester.enterText(campo('Descripción'), 'Receta móvil');
    await tester.enterText(
        campo('Restricciones alimentarias'), 'leche, gluten');
    await tester.enterText(campo('Existencias físicas iniciales'), '-1');
    await tester.tap(find.text('Guardar producto'));
    await tester.pumpAndSettle();
    expect(find.text('Cantidad entera entre 0 y 2147483647.'), findsOneWidget);
    await tester.enterText(campo('Existencias físicas iniciales'), '5');
    await tester.tap(find.text('Guardar producto'));
    await tester.pumpAndSettle();
    expect(resultado, {
      'nombre': 'Producto nativo',
      'descripcion': 'Receta móvil',
      'precio': '9999999999.99',
      'restriccionesAlimentarias': ['leche', 'gluten'],
      'activo': true,
      'cantidadInicial': 5
    });
  });
  testWidgets('ajuste requiere entero no nulo y motivo y conserva signo',
      (tester) async {
    DatosPedido? resultado;
    await tester.pumpWidget(MaterialApp(
        home: Builder(
            builder: (context) => Scaffold(
                body: TextButton(
                    onPressed: () async {
                      resultado = await showDialog<DatosPedido>(
                          context: context,
                          builder: (_) => const FormularioAjusteMenu());
                    },
                    child: const Text('Abrir'))))));
    await tester.tap(find.text('Abrir'));
    await tester.pumpAndSettle();
    await tester.enterText(campo('Variación de existencias'), '0');
    await tester.tap(find.text('Aplicar ajuste'));
    await tester.pumpAndSettle();
    expect(find.text('Indica un entero distinto de cero dentro del límite.'),
        findsOneWidget);
    expect(find.text('Completa el motivo.'), findsOneWidget);
    await tester.enterText(campo('Variación de existencias'), '-2');
    await tester.enterText(campo('Motivo del ajuste'), 'Merma registrada');
    await tester.tap(find.text('Aplicar ajuste'));
    await tester.pumpAndSettle();
    expect(resultado, {'delta': -2, 'motivo': 'Merma registrada'});
  });
  test(
      'respuesta perdida conserva intención y la nueva instancia repite el mismo UUID, sin tokens en preferencias',
      () async {
    final sesion = Sesion(almacen: AlmacenMemoria());
    await sesion.abrir(
        tokens: TokensSesion(
            acceso: 'acceso-prueba',
            accesoExpiraEn: DateTime.now().add(const Duration(hours: 1)),
            renovacion: 'renovacion-prueba',
            renovacionExpiraEn: DateTime.now().add(const Duration(days: 1))),
        usuario: const UsuarioSesion(
            id: 'personal-prueba',
            nombre: 'Personal',
            email: 'personal@example.test',
            roles: ['Personal']));
    final primera = PedidosApi(
        sesionActual: sesion,
        cliente: MockClient((r) async => throw Exception('respuesta perdida')));
    await expectLater(
        primera.operarMenu('local', {'delta': 3, 'motivo': 'Reposición'},
            producto: 'producto'),
        throwsA(isA<PedidosException>()));
    final pendiente = await primera.pendienteMenu();
    expect(pendiente, isNotNull);
    final prefs = await SharedPreferences.getInstance();
    expect(prefs.getString(prefs.getKeys().single),
        isNot(contains('acceso-prueba')));
    final segunda = PedidosApi(
        sesionActual: sesion,
        cliente: MockClient((r) async {
          expect(r.method, 'POST');
          expect(r.url.path,
              '/api/v1/pedidos/establecimientos/local/productos/producto/ajustes');
          expect(r.headers['Idempotency-Key'], pendiente!['id']);
          expect(jsonDecode(r.body), {'delta': 3, 'motivo': 'Reposición'});
          return http.Response(
              jsonEncode({'id': pendiente['id'], 'estado': 'APLICADA'}), 200);
        }));
    expect((await segunda.repetirMenu(pendiente!))['estado'], 'APLICADA');
    expect(await segunda.pendienteMenu(), isNull);
    final duplicado = PedidosApi(
        sesionActual: sesion,
        cliente: MockClient((r) async =>
            http.Response('{"message":"Producto duplicado"}', 409)));
    await expectLater(duplicado.operarMenu('local', {'nombre': 'Duplicado'}),
        throwsA(isA<PedidosException>()));
    expect(await duplicado.pendienteMenu(), isNull);
  });
}
