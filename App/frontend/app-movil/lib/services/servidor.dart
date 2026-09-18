import 'dart:io' show Platform;

/// Dónde está el backend.
///
/// Una sola dirección: el **API Gateway** (ADR-02), que autentica cada petición
/// y la enruta al microservicio correspondiente. La app no sabe cuántos
/// servicios hay ni en qué puerto está cada uno.
///
/// | Ruta | Va a |
/// |---|---|
/// | `/api/v1/sesiones`, `/api/v1/cuentas` | Administración (CU-027) |
/// | `/api/v1/reventa` | Entradas y Mercado Secundario (CU-006) |
///
/// El emulador de Android no ve el `localhost` de la máquina anfitriona: para
/// él `localhost` es el propio emulador. `10.0.2.2` es el alias que Android
/// reserva justo para esto. El simulador de iOS sí comparte red con el Mac.
///
/// En un teléfono físico hay que indicar la IP del computador:
///
///   flutter run --dart-define=HEXACORE_HOST=192.168.18.16
///
/// `HEXACORE_API` apunta a un gateway completo distinto (por ejemplo, uno
/// desplegado).
class Servidor {
  Servidor._();

  static const _host = String.fromEnvironment('HEXACORE_HOST');
  static const _api = String.fromEnvironment('HEXACORE_API');

  static String _hostPorDefecto() {
    if (_host.isNotEmpty) return _host;
    if (_api.isNotEmpty) return Uri.parse(_api).host;
    return Platform.isAndroid ? '10.0.2.2' : 'localhost';
  }

  /// API Gateway: el único punto de entrada al backend.
  static String get api => _api.isNotEmpty ? _api : 'http://${_hostPorDefecto()}:8080';

  /// Buzón del proveedor de correo simulado. **Solo tiene sentido en
  /// desarrollo**: ahí llegan los enlaces de verificación y recuperación, y no
  /// pasa por el gateway porque es un sistema externo simulado.
  static String get buzonDesarrollo => 'http://${_hostPorDefecto()}:3098/correos';

  static const prefijo = 'api/v1';
}
