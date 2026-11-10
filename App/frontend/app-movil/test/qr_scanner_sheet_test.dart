import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import 'package:hexacore_app/widgets/qr_scanner_sheet.dart';

class CamaraPrueba extends MobileScannerPlatform {
  final codigos = StreamController<BarcodeCapture?>.broadcast();
  int inicios = 0, paradas = 0, cierres = 0;
  MobileScannerErrorCode? fallo;
  @override
  Stream<BarcodeCapture?> get barcodesStream => codigos.stream;
  @override
  Stream<TorchState> get torchStateStream => const Stream.empty();
  @override
  Stream<double> get zoomScaleStateStream => const Stream.empty();
  @override
  Widget buildCameraView() => const ColoredBox(color: Colors.black);
  @override
  Future<MobileScannerViewAttributes> start(StartOptions opciones) async {
    inicios++;
    expect(opciones.formats, contains(BarcodeFormat.qrCode));
    if (fallo case final f?) throw MobileScannerException(errorCode: f);
    return const MobileScannerViewAttributes(
        cameraDirection: CameraFacing.back,
        currentTorchMode: TorchState.unavailable,
        size: Size(640, 480));
  }

  @override
  Future<void> stop() async {
    paradas++;
  }

  @override
  Future<void> dispose() async {
    cierres++;
  }
}

void main() {
  late MobileScannerPlatform anterior;
  late CamaraPrueba camara;
  setUp(() {
    anterior = MobileScannerPlatform.instance;
    camara = CamaraPrueba();
    MobileScannerController.resetPlatformSessionOwner();
    MobileScannerPlatform.instance = camara;
  });
  tearDown(() async {
    await camara.codigos.close();
    MobileScannerPlatform.instance = anterior;
    MobileScannerController.resetPlatformSessionOwner();
  });
  Future<void> abrir(WidgetTester t, List<String?> resultado) async {
    t.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
    await t.pumpWidget(MaterialApp(
        home: Builder(
            builder: (context) => Scaffold(
                body: TextButton(
                    onPressed: () async {
                      resultado.add(await showQrScannerSheet(context,
                          title: 'Escanear pedido'));
                    },
                    child: const Text('Abrir cámara'))))));
    expect(camara.inicios, 0);
    await t.tap(find.text('Abrir cámara'));
    await t.pumpAndSettle();
  }

  testWidgets(
      'solicita cámara solo al abrir, devuelve un único QR y cierra recursos aunque se repita la detección',
      (t) async {
    final r = <String?>[];
    await abrir(t, r);
    expect(camara.inicios, 1);
    final captura = BarcodeCapture(barcodes: [
      const Barcode(),
      Barcode(rawValue: 'a' * 64, format: BarcodeFormat.qrCode)
    ]);
    camara.codigos.add(captura);
    camara.codigos.add(captura);
    camara.codigos.add(captura);
    await t.pumpAndSettle();
    expect(r, ['a' * 64]);
    expect(camara.paradas, greaterThanOrEqualTo(1));
    expect(camara.cierres, 1);
    await t.pumpWidget(const SizedBox.shrink());
  });
  testWidgets(
      'suspende en segundo plano, ignora lecturas ocultas y vuelve a abrir al regresar',
      (t) async {
    final r = <String?>[];
    await abrir(t, r);
    t.binding.handleAppLifecycleStateChanged(AppLifecycleState.paused);
    await t.pumpAndSettle();
    expect(camara.paradas, 1);
    camara.codigos.add(BarcodeCapture(barcodes: [Barcode(rawValue: 'b' * 64)]));
    await t.pumpAndSettle();
    expect(r, isEmpty);
    t.binding.handleAppLifecycleStateChanged(AppLifecycleState.resumed);
    await t.pumpAndSettle();
    expect(camara.inicios, 2);
    await t.tap(find.byIcon(Icons.close));
    await t.pumpAndSettle();
    expect(r, [null]);
    expect(camara.cierres, 1);
    await t.pumpWidget(const SizedBox.shrink());
  });
  for (final fallo in [
    MobileScannerErrorCode.permissionDenied,
    MobileScannerErrorCode.genericError
  ]) {
    testWidgets(
        'explica $fallo, permite cerrar y no devuelve autorización local',
        (t) async {
      camara.fallo = fallo;
      final r = <String?>[];
      await abrir(t, r);
      expect(
          find.textContaining(fallo == MobileScannerErrorCode.permissionDenied
              ? 'Permiso de cámara denegado'
              : 'La cámara no está disponible'),
          findsOneWidget);
      expect(r, isEmpty);
      await t.tap(find.byIcon(Icons.close));
      await t.pumpAndSettle();
      expect(r, [null]);
      expect(camara.cierres, 1);
      await t.pumpWidget(const SizedBox.shrink());
    });
  }
}
