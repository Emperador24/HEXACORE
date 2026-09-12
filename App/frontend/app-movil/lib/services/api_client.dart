// Fachada de red: hoy todo es mock local (solo un delay simulado), pero
// centraliza las operaciones para que conectar el backend real después sea
// reemplazar el cuerpo de estos métodos por llamadas http/dio reales, en vez
// de tocar cada pantalla. Por ahora solo login, envío de OTP y confirmación
// de pago pasan por aquí como prueba de concepto — el resto de pantallas
// (parqueadero, restaurantes, reventa, etc.) sigue con su propio
// Future.delayed suelto, migrarlas es trabajo futuro.
class ApiClient {
  ApiClient._();
  static final ApiClient instance = ApiClient._();

  Future<bool> login(String email, String password) async {
    await Future.delayed(const Duration(milliseconds: 700));
    return true;
  }

  Future<void> sendOtp(String destination) async {
    await Future.delayed(const Duration(milliseconds: 700));
  }

  Future<bool> verifyOtp(String code) async {
    await Future.delayed(const Duration(milliseconds: 500));
    return code == '123456';
  }

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
