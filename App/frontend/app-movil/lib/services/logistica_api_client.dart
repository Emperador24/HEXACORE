// Cliente HTTP real hacia el backend de CU-018 (Gestionar turno y
// asistencia del personal), servicio `eventos-emergencias`
// (App/services/eventos-emergencias). A diferencia de `ApiClient`, este
// cliente sí habla con un servidor real — no hay Future.delayed simulado.
import 'dart:convert';

import 'package:flutter/foundation.dart' show TargetPlatform, defaultTargetPlatform, kIsWeb;
import 'package:http/http.dart' as http;

class LogisticaApiException implements Exception {
  LogisticaApiException(this.message);
  final String message;
  @override
  String toString() => message;
}

class LogisticaApiClient {
  LogisticaApiClient._();
  static final LogisticaApiClient instance = LogisticaApiClient._();

  // Un dispositivo físico (celular real, no emulador/simulador) no puede
  // resolver "localhost" como el propio computador que corre el backend:
  // hay que pasarle la IP de red local del Mac. Ej.:
  //   flutter run --dart-define=API_BASE_URL=http://192.168.0.7:3016
  // El emulador de Android sí puede resolver su alias especial 10.0.2.2
  // hacia el host sin necesitar esto.
  static const _override = String.fromEnvironment('API_BASE_URL');

  static String get _baseUrl {
    if (_override.isNotEmpty) return _override;
    if (!kIsWeb && defaultTargetPlatform == TargetPlatform.android) {
      return 'http://10.0.2.2:3016';
    }
    return 'http://localhost:3016';
  }

  Uri _uri(String path, [Map<String, String>? query]) =>
      Uri.parse('$_baseUrl$path').replace(queryParameters: query);

  Map<String, dynamic> _decodeObject(http.Response res) {
    if (res.statusCode >= 400) {
      final body = _tryDecode(res.body);
      throw LogisticaApiException(
          (body is Map && body['message'] != null)
              ? body['message'].toString()
              : 'Error del servidor (${res.statusCode}).');
    }
    return jsonDecode(res.body) as Map<String, dynamic>;
  }

  List<dynamic> _decodeList(http.Response res) {
    if (res.statusCode >= 400) {
      throw LogisticaApiException('Error del servidor (${res.statusCode}).');
    }
    return jsonDecode(res.body) as List<dynamic>;
  }

  dynamic _tryDecode(String body) {
    try {
      return jsonDecode(body);
    } catch (_) {
      return null;
    }
  }

  /// Turno vigente/actual del empleado identificado por su credencial
  /// (usamos el email de la cuenta demo como credencial). Devuelve `null`
  /// si no tiene ningún turno asignado todavía.
  Future<Map<String, dynamic>?> miTurno(String credencial) async {
    final turnos = _decodeList(await http.get(_uri('/turnos')));
    for (final turno in turnos) {
      final empleado = turno['empleado'];
      if (empleado is Map && empleado['credencial'] == credencial) {
        return turno as Map<String, dynamic>;
      }
    }
    return null;
  }

  Future<Map<String, dynamic>> solicitarCambioTurno({
    required String turnoId,
    required String motivo,
  }) async {
    final res = await http.post(
      _uri('/turnos/$turnoId/solicitudes-cambio'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({'motivo': motivo}),
    );
    return _decodeObject(res);
  }

  Future<List<dynamic>> solicitudesPendientes() async {
    final res = await http.get(_uri('/solicitudes-cambio', {'estado': 'PENDIENTE'}));
    return _decodeList(res);
  }

  Future<Map<String, dynamic>> revisarSolicitud({
    required String solicitudId,
    required String supervisorCredencial,
    required bool aprobar,
  }) async {
    final res = await http.patch(
      _uri('/solicitudes-cambio/$solicitudId/revisar'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({
        'supervisorId': supervisorCredencial,
        'aprobar': aprobar,
      }),
    );
    return _decodeObject(res);
  }

  Future<Map<String, dynamic>> registrarEntrada(String credencial) async {
    final res = await http.post(
      _uri('/asistencia/entrada'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({'credencial': credencial}),
    );
    return _decodeObject(res);
  }

  /// Últimos registros de entrada/salida del empleado, más reciente primero.
  Future<List<dynamic>> misRegistrosAsistencia(String credencial) async {
    final registros = _decodeList(await http.get(_uri('/asistencia')));
    return registros
        .where((r) => (r['empleado'] as Map?)?['credencial'] == credencial)
        .toList();
  }

  Future<Map<String, dynamic>> registrarSalida(String credencial) async {
    final res = await http.post(
      _uri('/asistencia/salida'),
      headers: {'Content-Type': 'application/json'},
      body: jsonEncode({'credencial': credencial}),
    );
    return _decodeObject(res);
  }
}

final logisticaApiClient = LogisticaApiClient.instance;
