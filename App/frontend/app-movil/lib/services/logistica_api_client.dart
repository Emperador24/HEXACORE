// Cliente del CU-018 (turnos y asistencia del personal), contra el servicio
// `eventos-emergencias`.
//
// Habla con el **API Gateway** como todo lo demás (ADR-02): no conoce el puerto
// del servicio, y cada petición lleva el token de sesión, que es lo que le dice
// al servidor quién pregunta. Ya no se manda la credencial del empleado como
// identidad — eso permitía marcarle la entrada a un compañero sabiendo su
// correo.
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
  // Igual que `CuentasApi`: el cliente HTTP se puede sustituir, que es lo que
  // permite probar estas pantallas sin un servidor detrás.
  LogisticaApiClient({http.Client? cliente}) : _cliente = cliente ?? http.Client();

  final http.Client _cliente;

  static const _espera = Duration(seconds: 15);

  Uri _uri(String ruta, [Map<String, String>? consulta]) =>
      Uri.parse('${Servidor.api}/${Servidor.prefijo}/logistica$ruta')
          .replace(queryParameters: consulta);

  Future<http.Response> _conSesion(
      Future<http.Response> Function(Map<String, String> cabeceras)
          enviar) async {
    try {
      return await sesion.conAcceso<http.Response>(
        (token) => enviar({
          'Content-Type': 'application/json',
          'Authorization': 'Bearer $token',
        }),
        estado: (r) => r.statusCode,
        sinSesion: () => throw LogisticaApiException(
            'Inicia sesión para ver tus turnos.',
            codigo: 'SIN_SESION',
            estado: 401),
      );
    } on RenovacionNoDisponible catch (error) {
      throw LogisticaApiException(error.mensaje,
          codigo: 'SIN_CONEXION', estado: 0);
    }
  }

  dynamic _leer(http.Response res) {
    final cuerpo = res.body.isEmpty ? null : jsonDecode(res.body);
    if (res.statusCode >= 400) {
      final mapa = cuerpo is Map<String, dynamic> ? cuerpo : const {};
      throw LogisticaApiException(
        (mapa['mensaje'] ?? mapa['message'] ?? 'Error del servidor (${res.statusCode}).')
            .toString(),
        codigo: mapa['codigo'] as String?,
        estado: res.statusCode,
      );
    }
    return cuerpo;
  }

  /// Quién es quien acaba de entrar: su área y su turno vigente.
  ///
  /// Devuelve `null` si la cuenta no está dada de alta como empleado — que no
  /// es un error, es el caso de cualquier cliente.
  Future<FichaEmpleado?> miFicha() async {
    final res =
        await _conSesion((c) => _cliente.get(_uri('/empleados/yo'), headers: c).timeout(_espera));
    if (res.statusCode == 404) return null;
    return FichaEmpleado.desdeJson(_leer(res) as Map<String, dynamic>);
  }

  /// El turno vigente de quien pregunta. Sale de la misma ficha: el servidor ya
  /// sabe de quién es la sesión, no hace falta mandarle una credencial.
  Future<Map<String, dynamic>?> miTurno() async => (await miFicha())?.turnoVigente;

  Future<Map<String, dynamic>> solicitarCambioTurno({
    required String turnoId,
    required String motivo,
  }) async {
    final res = await _conSesion((c) => _cliente
        .post(_uri('/turnos/$turnoId/solicitudes-cambio'),
            headers: c, body: jsonEncode({'motivo': motivo}))
        .timeout(_espera));
    return _leer(res) as Map<String, dynamic>;
  }

  Future<List<dynamic>> solicitudesPendientes() async {
    final res = await _conSesion((c) => _cliente
        .get(_uri('/solicitudes-cambio', {'estado': 'PENDIENTE'}), headers: c)
        .timeout(_espera));
    return _leer(res) as List<dynamic>;
  }

  /// Aprobar o rechazar una solicitud. Quién revisa lo dice el token: el
  /// servidor comprueba que sea jefe de personal.
  Future<Map<String, dynamic>> revisarSolicitud({
    required String solicitudId,
    required bool aprobar,
  }) async {
    final res = await _conSesion((c) => _cliente
        .patch(_uri('/solicitudes-cambio/$solicitudId/revisar'),
            headers: c, body: jsonEncode({'aprobar': aprobar}))
        .timeout(_espera));
    return _leer(res) as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> registrarEntrada(String credencial) async {
    final res = await _conSesion((c) => _cliente
        .post(_uri('/asistencia/entrada'),
            headers: c, body: jsonEncode({'credencial': credencial}))
        .timeout(_espera));
    return _leer(res) as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>> registrarSalida(String credencial) async {
    final res = await _conSesion((c) => _cliente
        .post(_uri('/asistencia/salida'),
            headers: c, body: jsonEncode({'credencial': credencial}))
        .timeout(_espera));
    return _leer(res) as Map<String, dynamic>;
  }

  /// Últimos registros de entrada/salida del empleado, más reciente primero.
  Future<List<dynamic>> misRegistrosAsistencia(String credencial) async {
    final res =
        await _conSesion((c) => _cliente.get(_uri('/asistencia'), headers: c).timeout(_espera));
    final registros = _leer(res) as List<dynamic>;
    return registros
        .where((r) => (r['empleado'] as Map?)?['credencial'] == credencial)
        .toList();
  }
}

LogisticaApiClient logisticaApiClient = LogisticaApiClient();
