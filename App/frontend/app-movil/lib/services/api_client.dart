// Fachada de red de lo que todavía es simulado (solo un delay): la compra de
// entradas y la confirmación de pago (CU-001). Conectar esos casos de uso es
// reemplazar el cuerpo de estos métodos, sin tocar cada pantalla.
//
// Las cuentas y la sesión (CU-027) ya son reales: ver cuentas_api.dart. La
// reventa (CU-006) también: ver reventa_api.dart.
class ApiClient {
  ApiClient._();
  static final ApiClient instance = ApiClient._();

  Future<void> confirmPayment(
      {required int amount, required String method}) async {
    await Future.delayed(const Duration(milliseconds: 800));
  }

  Future<void> purchaseTicket(
      {required String eventId, required int quantity}) async {
    await Future.delayed(const Duration(milliseconds: 800));
  }
}

final apiClient = ApiClient.instance;
