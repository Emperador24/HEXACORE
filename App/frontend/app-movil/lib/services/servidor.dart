import 'dart:io' show Platform;

/// Dónde están los servicios del backend.
///
/// En producción todo iría al **API Gateway** (ADR-02) con una sola dirección;
/// en desarrollo se habla directo con cada microservicio, cada uno en su
/// puerto:
///
/// | Servicio | Puerto |
/// |---|---|
/// | Entradas y Mercado Secundario (CU-006) | 3001 |
/// | Administración: cuentas y sesiones (CU-027) | 3002 |
/// | Buzón del correo simulado (solo desarrollo) | 3098 |
///
/// El emulador de Android no ve el `localhost` de la máquina anfitriona: para
/// él `localhost` es el propio emulador. `10.0.2.2` es el alias que Android
/// reserva justo para esto. El simulador de iOS sí comparte red con el Mac.
///
/// En un teléfono físico hay que indicar la IP del Mac:
///
///   flutter run --dart-define=HEXACORE_HOST=192.168.18.16
///
/// `HEXACORE_API` y `HEXACORE_AUTH` siguen funcionando para apuntar cada
/// servicio a una URL completa distinta (por ejemplo, un backend desplegado).
class Servidor {
  Servidor._();

  static const _host = String.fromEnvironment('HEXACORE_HOST');
  static const _api = String.fromEnvironment('HEXACORE_API');
  static const _auth = String.fromEnvironment('HEXACORE_AUTH');

  static String _hostPorDefecto() {
    if (_host.isNotEmpty) return _host;
    // Compatibilidad: antes solo existía HEXACORE_API; si se dio, el resto de
    // servicios se buscan en la misma máquina.
    if (_api.isNotEmpty) return Uri.parse(_api).host;
    return Platform.isAndroid ? '10.0.2.2' : 'localhost';
  }

  static String _url(String definida, int puerto) =>
      definida.isNotEmpty ? definida : 'http://${_hostPorDefecto()}:$puerto';

  /// Servicio de Entradas y Mercado Secundario.
  static String get entradas => _url(_api, 3001);

  /// Servicio de Administración: registro, login, sesiones y perfil.
  static String get cuentas => _url(_auth, 3002);

  /// Buzón del proveedor de correo simulado. **Solo tiene sentido en
  /// desarrollo**: ahí llegan los enlaces de verificación y recuperación.
  static String get buzonDesarrollo =>
      'http://${_hostPorDefecto()}:3098/correos';

  static const prefijo = 'api/v1';
}
