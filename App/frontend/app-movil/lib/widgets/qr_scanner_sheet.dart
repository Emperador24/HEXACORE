import 'dart:async';
import 'package:flutter/material.dart';
import 'package:mobile_scanner/mobile_scanner.dart';

// abre la cámara y devuelve lo escaneado, o null si se cierra sin nada
Future<String?> showQrScannerSheet(BuildContext context,
    {required String title}) {
  return Navigator.of(context).push<String>(
    MaterialPageRoute(
        fullscreenDialog: true, builder: (_) => _QrScannerPage(title: title)),
  );
}

class _QrScannerPage extends StatefulWidget {
  const _QrScannerPage({required this.title});
  final String title;

  @override
  State<_QrScannerPage> createState() => _QrScannerPageState();
}

class _QrScannerPageState extends State<_QrScannerPage>
    with WidgetsBindingObserver {
  final _controller = MobileScannerController(
      formats: const [BarcodeFormat.qrCode],
      detectionSpeed: DetectionSpeed.noDuplicates);
  bool _handled = false, _activo = true, _ocupando = false;
  @override
  void initState() {
    super.initState();
    final estado = WidgetsBinding.instance.lifecycleState;
    _activo = estado == null || estado == AppLifecycleState.resumed;
    WidgetsBinding.instance.addObserver(this);
    _controller.addListener(_sincronizar);
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState estado) {
    _activo = estado == AppLifecycleState.resumed;
    _sincronizar();
  }

  void _sincronizar() {
    if (!mounted || _handled || _ocupando) return;
    final v = _controller.value;
    if (!v.isInitialized ||
        v.isStarting ||
        !v.hasCameraPermission ||
        v.error != null ||
        _activo == v.isRunning) {
      return;
    }
    _ocupando = true;
    final f = _activo ? _controller.start() : _controller.stop();
    unawaited(f.then((_) {
      _ocupando = false;
      if (mounted) _sincronizar();
    }, onError: (Object _) {
      _ocupando = false;
    }));
  }

  Future<void> _reintentar() async {
    if (_ocupando || !_activo || _handled) return;
    _ocupando = true;
    try {
      await _controller.start();
    } catch (_) {
      /* El estado del controlador muestra el fallo, sin registrar el código. */
    } finally {
      _ocupando = false;
      if (mounted) _sincronizar();
    }
  }

  Widget _error(BuildContext context, MobileScannerException error) => Center(
      child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            Text(
                error.errorCode == MobileScannerErrorCode.permissionDenied
                    ? 'Permiso de cámara denegado. Habilítalo en Ajustes o cierra e ingresa el código manualmente.'
                    : 'La cámara no está disponible. Puedes reintentar o ingresar el código manualmente.',
                style: const TextStyle(color: Colors.white),
                textAlign: TextAlign.center),
            TextButton(
                onPressed: _reintentar, child: const Text('Reintentar cámara'))
          ])));

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _controller.removeListener(_sincronizar);
    unawaited(_controller.dispose());
    super.dispose();
  }

  void _onDetect(BarcodeCapture capture) {
    if (_handled || !_activo) return;
    final value = capture.barcodes
        .map((b) => b.rawValue)
        .whereType<String>()
        .firstWhere((v) => v.trim().isNotEmpty, orElse: () => '');
    if (value.isEmpty) return;
    _handled = true;
    unawaited(_devolver(value));
  }

  Future<void> _devolver(String codigo) async {
    try {
      await _controller.stop();
    } catch (_) {/* Dispose también libera la sesión. */}
    if (mounted) Navigator.of(context).pop(codigo);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      body: Stack(
        fit: StackFit.expand,
        children: [
          MobileScanner(
              controller: _controller,
              onDetect: _onDetect,
              errorBuilder: _error),
          IgnorePointer(
              child: Center(
            child: Container(
              width: 240,
              height: 240,
              decoration: BoxDecoration(
                border: Border.all(
                    color: Colors.white.withValues(alpha: 0.85), width: 2.5),
                borderRadius: BorderRadius.circular(24),
              ),
            ),
          )),
          SafeArea(
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              child: Row(
                children: [
                  IconButton(
                    onPressed: () => Navigator.of(context).pop(),
                    icon: const Icon(Icons.close, color: Colors.white),
                  ),
                  Expanded(
                    child: Text(
                      widget.title,
                      textAlign: TextAlign.center,
                      style: const TextStyle(
                          color: Colors.white,
                          fontWeight: FontWeight.w600,
                          fontSize: 16),
                    ),
                  ),
                  const SizedBox(width: 48),
                ],
              ),
            ),
          ),
          Positioned(
            left: 0,
            right: 0,
            bottom: 48,
            child: Text(
              'Apunta la cámara al código QR',
              textAlign: TextAlign.center,
              style: TextStyle(
                  color: Colors.white.withValues(alpha: 0.75), fontSize: 13),
            ),
          ),
        ],
      ),
    );
  }
}
