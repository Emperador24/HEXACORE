// Cliente del CU-018 (turnos y asistencia del personal), contra el servicio
// `eventos-emergencias`.
//
// Habla con el **API Gateway** como todo lo demás (ADR-02): no conoce el puerto
// del servicio. Y cada petición va con **el token de la sesión de quien está
// usando la app**, no con un token de sistema quemado en el código: desde que
// las cuentas de personal existen de verdad en Administración (CU-027), el
// login real es posible y ese atajo ya no hace falta.
import 'dart:convert';

import 'package:http/http.dart' as http;

import 'servidor.dart';
import 'sesion.dart';

class LogisticaApiException implements Exception {
  LogisticaApiException(this.message, {this.codigo, this.estado = 0});
  final String message;
  final String? codigo;
  final int estado;
  @override
  String toString() => message;
}

/// La ficha de quien inició sesión: su área de trabajo y su turno vigente.
///
/// El **área** es lo que decide qué ve en la app. No viene del token ni de una
/// lista dentro de la app: la asigna un administrador al dar de alta al
/// empleado, y se consulta al servidor al entrar.
class FichaEmpleado {
  const FichaEmpleado({
    required this.id,
    required this.nombre,
    required this.area,
    required this.credencial,
    this.turnoVigente,
  });

  final String id;
  final String nombre;
  final String area;
  final String credencial;
  final Map<String, dynamic>? turnoVigente;

  static FichaEmpleado desdeJson(Map<String, dynamic> json) {
    final empleado = json['empleado'] as Map<String, dynamic>;
    return FichaEmpleado(
      id: empleado['id'] as String,
      nombre: empleado['nombre'] as String,
      area: empleado['rol'] as String,
      credencial: empleado['credencial'] as String,
      turnoVigente: json['turnoVigente'] as Map<String, dynamic>?,
    );
  }
}

class LogisticaApiClient {
  // El cliente HTTP se puede sustituir, igual que en `CuentasApi`: es lo que
  // permite probar estas pantallas sin un servidor detrás.
  LogisticaApiClient({http.Client? cliente}) : _cliente = cliente ?? http.Client();

  final http.Client _cliente;

  static const _espera = Duration(seconds: 15);

  Uri _uri(String path, [Map<String, String>? query]) =>
      Uri.parse('${Servidor.api}/${Servidor.prefijo}/logistica$path')
          .replace(queryParameters: query);

  /// Envía con el token de la sesión, renovándolo si hace falta.
  Future<http.Response> _conSesion(
      Future<http.Response> Function(Map<String, String> cabeceras) enviar) async {
    try {
      return await sesion.conAcceso<http.Response>(
        (token) => enviar({
          'Content-Type': 'application/json',
          'Authorization': 'Bearer $token',
        }),
        estado: (r) => r.statusCode,
        sinSesion: () => throw LogisticaApiException('Inicia sesión para ver tus turnos.',
            codigo: 'SIN_SESION', estado: 401),
      );
    } on RenovacionNoDisponible catch (error) {
      throw LogisticaApiException(error.mensaje, codigo: 'SIN_CONEXION');
    }
  }

  /// Quién es quien acaba de entrar: su área y su turno vigente. `null` si la
  /// cuenta no está dada de alta como empleado — que no es un error, es el
  /// caso de cualquier cliente.
  Future<FichaEmpleado?> miFicha() async {
    final res = await _conSesion(
        (c) => _cliente.get(_uri('/empleados/yo'), headers: c).timeout(_espera));
    if (res.statusCode == 404) return null;
    return FichaEmpleado.desdeJson(_decodeObject(res));
  }

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
    final res = await _conSesion((c) => _cliente.get(_uri('/empleados'), headers: c).timeout(_espera));
    return _decodeList(res);
  }

  /// Evidencia real de la cola "turnos.cambios" (RabbitMQ): cada cambio de
  /// turno aprobado que el consumidor procesó, con la latencia
  /// publicación→consumo — para demostrar la infraestructura de mensajería.
  Future<List<dynamic>> notificacionesRecientes() async {
    final res = await _conSesion((c) => _cliente.get(_uri('/notificaciones'), headers: c).timeout(_espera));
    return _decodeList(res);
  }

  Future<Map<String, dynamic>> crearTurno({
    required String empleadoId,
    required String eventoId,
    required String zona,
    required DateTime horaInicio,
    required DateTime horaFin,
  }) async {
    final res = await _conSesion((c) => _cliente.post(_uri('/turnos'), headers: c, body: jsonEncode({
        'empleadoId': empleadoId,
        'eventoId': eventoId,
        'zona': zona,
        'horaInicio': horaInicio.toUtc().toIso8601String(),
        'horaFin': horaFin.toUtc().toIso8601String(),
      })).timeout(_espera));
    return _decodeObject(res);
  }

  /// Turno vigente/actual del empleado identificado por su credencial
  /// (usamos el email de la cuenta demo como credencial). Devuelve `null`
  /// si no tiene ningún turno asignado todavía.
  Future<Map<String, dynamic>?> miTurno(String credencial) async {
    final turnos =
        _decodeList(await _conSesion((c) => _cliente.get(_uri('/turnos'), headers: c).timeout(_espera)));
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
    final res = await _conSesion((c) => _cliente.post(_uri('/turnos/$turnoId/solicitudes-cambio'), headers: c, body: jsonEncode({'motivo': motivo})).timeout(_espera));
    return _decodeObject(res);
  }

  Future<List<dynamic>> solicitudesPendientes() async {
    final res = await _conSesion((c) => _cliente.get(_uri('/solicitudes-cambio', {'estado': 'PENDIENTE'}), headers: c).timeout(_espera));
    return _decodeList(res);
  }

  Future<Map<String, dynamic>> revisarSolicitud({
    required String solicitudId,
    required String supervisorCredencial,
    required bool aprobar,
  }) async {
    final res = await _conSesion((c) => _cliente.patch(_uri('/solicitudes-cambio/$solicitudId/revisar'), headers: c, body: jsonEncode({
        'supervisorId': supervisorCredencial,
        'aprobar': aprobar,
      })).timeout(_espera));
    return _decodeObject(res);
  }

  // `eventoId` evita que la asistencia se cruce entre dos eventos
  // simultáneos del mismo empleado (backend: `AsistenciaService.
  // buscarEntradaAbierta`, acotado por turno/evento cuando se envía).
  Future<Map<String, dynamic>> registrarEntrada(
      String credencial, String eventoId) async {
    final res = await _conSesion((c) => _cliente.post(_uri('/asistencia/entrada'), headers: c, body: jsonEncode({'credencial': credencial, 'eventoId': eventoId})).timeout(_espera));
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
    final res = await _conSesion((c) => _cliente.get(_uri('/asistencia'), headers: c).timeout(_espera));
    return _decodeList(res);
  }

  Future<Map<String, dynamic>> registrarSalida(
      String credencial, String eventoId) async {
    final res = await _conSesion((c) => _cliente.post(_uri('/asistencia/salida'), headers: c, body: jsonEncode({'credencial': credencial, 'eventoId': eventoId})).timeout(_espera));
    return _decodeObject(res);
  }
}

LogisticaApiClient logisticaApiClient = LogisticaApiClient();
