import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:hexacore_app/widgets/qr_scanner_sheet.dart';

// Ensayo óptico en dispositivo real con el mismo componente del restaurante.
// El QR privado procede del pago CU-011 del recorrido web CU-014. El comprobador
// solo identifica la imagen del ensayo; jamás autoriza una entrega.
String verificadorOptico(String codigo) {
  var n = BigInt.parse('14695981039346656037');
  final primo = BigInt.parse('1099511628211');
  final mascara = BigInt.parse('ffffffffffffffff', radix: 16);
  for (final b in utf8.encode(codigo)) {
    n = ((n ^ BigInt.from(b)) * primo) & mascara;
  }
  return n.toRadixString(16).padLeft(16, '0');
}

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();
  testWidgets('CU-014 cámara física lee el QR real y vuelve al cerrar',
      (tester) async {
    const esperado = String.fromEnvironment('CU014_QR_VERIFICADOR');
    expect(esperado, matches(RegExp(r'^[a-f0-9]{16}$')));
    final resultado = Completer<String?>();
    await tester.pumpWidget(MaterialApp(home: Builder(builder: (context) {
      return Scaffold(
          body: Center(
              child: ElevatedButton(
                  onPressed: () async {
                    resultado.complete(await showQrScannerSheet(context,
                        title: 'CU-014: QR real de prueba'));
                  },
                  child: const Text('Abrir cámara real'))));
    })));
    await tester.tap(find.text('Abrir cámara real'));
    await tester.pump();
    // Solo se informa el estado de la prueba, nunca el QR leído.
    debugPrint(
        'CU014_CAMARA_LISTA: aceptar permiso y apuntar al QR en el Mac.');
    final codigo = await tester
        .runAsync(() => resultado.future.timeout(const Duration(seconds: 120)));
    expect(
        codigo != null && RegExp(r'^[a-f0-9]{64}$').hasMatch(codigo), isTrue,
        reason: 'La cámara debe devolver el formato del QR del pedido.');
    expect(codigo == null ? '' : verificadorOptico(codigo), esperado,
        reason: 'Debe corresponder al QR real del ensayo, sin imprimirlo.');
    await tester.pumpAndSettle();
    expect(find.text('Abrir cámara real'), findsOneWidget);
    debugPrint('CU014_CAMARA_OK: lectura del QR real y cierre comprobados.');
  });
}
