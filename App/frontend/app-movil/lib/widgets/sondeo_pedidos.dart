import 'dart:async';
import 'package:flutter/widgets.dart';

/// Solo la pantalla activa; sin solapar peticiones ni repetir errores de red.
class SondeoPedidos with WidgetsBindingObserver {
  SondeoPedidos(
      {required this.activo, required this.ocupado, required this.consultar}) {
    WidgetsBinding.instance.addObserver(this);
    if (WidgetsBinding.instance.lifecycleState == null ||
        WidgetsBinding.instance.lifecycleState == AppLifecycleState.resumed) {
      _iniciar();
    }
  }
  final bool Function() activo;
  final bool Function() ocupado;
  final Future<void> Function() consultar;
  bool pausado = false;
  Timer? _timer;
  void _iniciar() {
    _timer ??= Timer.periodic(const Duration(seconds: 15), (_) {
      if (!pausado && activo() && !ocupado()) unawaited(consultar());
    });
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      _iniciar();
    } else {
      _timer?.cancel();
      _timer = null;
    }
  }

  void dispose() {
    _timer?.cancel();
    WidgetsBinding.instance.removeObserver(this);
  }
}

String avancePedido(String? estado) => switch (estado) {
      'EN_PREPARACION' => 'En preparación',
      'LISTO_PARA_ENTREGAR' => 'Listo para entregar',
      _ => 'Recibido por el establecimiento',
    };
String fechaPedido(dynamic valor) {
  final fecha = DateTime.tryParse(valor?.toString() ?? '');
  return fecha == null
      ? 'Por definir'
      : fecha.toLocal().toString().substring(0, 16);
}
