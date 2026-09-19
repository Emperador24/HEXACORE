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

  // Token de "sistema" firmado con la clave de desarrollo (RNF-06) — las
  // cuentas demo (`_accounts` en main.dart) no existen todavía como cuentas
  // reales en Administración, así que no hay login real posible desde la
  // app. Ver el mismo patrón en `scripts/seed.mjs`. Dev-only, expira: hay
  // que regenerarlo si la sesión de pruebas dura más de lo firmado.
  static const _tokenSistema = String.fromEnvironment(
    'API_TOKEN',
    defaultValue:
        'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlcyI6WyJBZG1pbmlzdHJhZG9yIiwiUGVyc29uYWwiLCJPcmdhbml6YWRvciJdLCJpYXQiOjE3ODk3MDcxMjcsImV4cCI6MTc4OTc5MzUyNywiaXNzIjoiaGV4YWNvcmUtYWRtaW5pc3RyYWNpb24iLCJzdWIiOiJjYjdlOWM0OC04YTViLTRiYzMtYmMxMi04MWJhZjU3OGM5NzQiLCJqdGkiOiJmYzJkMjExMS04OTIxLTQ3OWYtOGM5My0zMjVhOTUyMGZjOWYifQ.I4tMK942emRjtieW3xlErCfAZpYeC2xiykIrvFrJEDKN75Oj2j6Mq-013JqRhh-IjjDBFEsDWivqNvqxgwWwR5_yPb2vVKcHCM4uCRSZ3V59UlY1RfTp8Q376t_xmFjpVhfIgt3SqyBX4uIqqQyS1wyVB6fcJEZZ2KYk2MnLO7txDsL3vqff72oKVIc-geFSwYd1xisVtVEbLmI_gBPb0DfsGNNo1VYStq5heJJ0amYJxjHi1e8dkjwvei0L0BU5dSbfEKf7MemXfLqLg13EgKqADg8dUWx7Kqz6SHi7b_8hB2sTqtbS-0qAAMrSQdAq6WyHr--8xDGh_S8GvqxDMA',
  );

  static Map<String, String> get _headers => {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer $_tokenSistema',
      };

  Uri _uri(String path, [Map<String, String>? query]) =>
      Uri.parse('$_baseUrl/api/v1/logistica$path').replace(queryParameters: query);

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

  /// Todo el personal registrado — para que el Jefe de personal pueda
  /// elegir a quién asignarle un turno, y ver sus horas trabajadas.
  Future<List<dynamic>> listarEmpleados() async {
    final res = await http.get(_uri('/empleados'), headers: _headers);
    return _decodeList(res);
  }

  /// Evidencia real de la cola "turnos.cambios" (RabbitMQ): cada cambio de
  /// turno aprobado que el consumidor procesó, con la latencia
  /// publicación→consumo — para demostrar la infraestructura de mensajería.
  Future<List<dynamic>> notificacionesRecientes() async {
    final res = await http.get(_uri('/notificaciones'), headers: _headers);
    return _decodeList(res);
  }

  Future<Map<String, dynamic>> crearTurno({
    required String empleadoId,
    required String eventoId,
    required String zona,
    required DateTime horaInicio,
    required DateTime horaFin,
  }) async {
    final res = await http.post(
      _uri('/turnos'),
      headers: _headers,
      body: jsonEncode({
        'empleadoId': empleadoId,
        'eventoId': eventoId,
        'zona': zona,
        'horaInicio': horaInicio.toUtc().toIso8601String(),
        'horaFin': horaFin.toUtc().toIso8601String(),
      }),
    );
    return _decodeObject(res);
  }

  /// Turno vigente/actual del empleado identificado por su credencial
  /// (usamos el email de la cuenta demo como credencial). Devuelve `null`
  /// si no tiene ningún turno asignado todavía.
  Future<Map<String, dynamic>?> miTurno(String credencial) async {
    final turnos =
        _decodeList(await http.get(_uri('/turnos'), headers: _headers));
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
      headers: _headers,
      body: jsonEncode({'motivo': motivo}),
    );
    return _decodeObject(res);
  }

  Future<List<dynamic>> solicitudesPendientes() async {
    final res = await http.get(
      _uri('/solicitudes-cambio', {'estado': 'PENDIENTE'}),
      headers: _headers,
    );
    return _decodeList(res);
  }

  Future<Map<String, dynamic>> revisarSolicitud({
    required String solicitudId,
    required String supervisorCredencial,
    required bool aprobar,
  }) async {
    final res = await http.patch(
      _uri('/solicitudes-cambio/$solicitudId/revisar'),
      headers: _headers,
      body: jsonEncode({
        'supervisorId': supervisorCredencial,
        'aprobar': aprobar,
      }),
    );
    return _decodeObject(res);
  }

  // `eventoId` evita que la asistencia se cruce entre dos eventos
  // simultáneos del mismo empleado (backend: `AsistenciaService.
  // buscarEntradaAbierta`, acotado por turno/evento cuando se envía).
  Future<Map<String, dynamic>> registrarEntrada(
      String credencial, String eventoId) async {
    final res = await http.post(
      _uri('/asistencia/entrada'),
      headers: _headers,
      body: jsonEncode({'credencial': credencial, 'eventoId': eventoId}),
    );
    return _decodeObject(res);
  }

  /// Últimos registros de entrada/salida del empleado, más reciente primero.
  Future<List<dynamic>> misRegistrosAsistencia(String credencial) async {
    final registros = await _todosRegistrosAsistencia();
    return registros
        .where((r) => (r['empleado'] as Map?)?['credencial'] == credencial)
        .toList();
  }

  /// Todos los registros de entrada/salida de todo el personal, más
  /// reciente primero — vista del supervisor (Jefe de personal).
  Future<List<dynamic>> registrosAsistenciaDelPersonal() =>
      _todosRegistrosAsistencia();

  Future<List<dynamic>> _todosRegistrosAsistencia() async {
    final res = await http.get(_uri('/asistencia'), headers: _headers);
    return _decodeList(res);
  }

  Future<Map<String, dynamic>> registrarSalida(
      String credencial, String eventoId) async {
    final res = await http.post(
      _uri('/asistencia/salida'),
      headers: _headers,
      body: jsonEncode({'credencial': credencial, 'eventoId': eventoId}),
    );
    return _decodeObject(res);
  }
}

final logisticaApiClient = LogisticaApiClient.instance;
