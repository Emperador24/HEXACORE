// Parqueadero del cliente (CU-021) contra el Núcleo, por el API Gateway: el
// mismo contrato que usa el portal web (RNF-14). Reservar retiene un espacio
// que asigna el servidor (CU-023) y pagar entrega el QR que se presenta en el
// punto de control (CU-022).
import 'dart:convert';

import 'package:http/http.dart' as http;

import 'servidor.dart';
import 'sesion.dart';

class ParqueaderoApiException implements Exception {
  ParqueaderoApiException(this.mensaje, {this.codigo, this.estado = 0, this.cuerpo});
  final String mensaje;
  final String? codigo;
  final int estado;

  /// El cuerpo completo del error: CU-021A trae las zonas alternativas.
  final Map<String, dynamic>? cuerpo;
  @override
  String toString() => mensaje;
}

/// Un evento de la cartelera, lo justo para elegir dónde parquear.
class EventoCartelera {
  EventoCartelera({required this.id, required this.nombre, required this.lugar, required this.ciudad, required this.fechaInicio});
  factory EventoCartelera.desdeJson(Map<String, dynamic> j) => EventoCartelera(
        id: j['id'] as String,
        nombre: j['nombre'] as String,
        lugar: j['lugar'] as String? ?? '',
        ciudad: j['ciudad'] as String? ?? '',
        fechaInicio: DateTime.parse(j['fechaInicio'] as String),
      );
  final String id;
  final String nombre;
  final String lugar;
  final String ciudad;
  final DateTime fechaInicio;
}

class ParqueaderoApi {
  ParqueaderoApi({http.Client? cliente}) : _cliente = cliente ?? http.Client();

  final http.Client _cliente;
  static const _espera = Duration(seconds: 15);

  Uri _uri(String path, [Map<String, String>? query]) =>
      Uri.parse('${Servidor.api}/${Servidor.prefijo}$path').replace(queryParameters: query);

  Future<dynamic> _pedir(String metodo, String path, {Map<String, dynamic>? cuerpo, Map<String, String>? query}) async {
    final http.Response res;
    try {
      res = await sesion.conAcceso<http.Response>(
        (token) {
          final cabeceras = {'Content-Type': 'application/json', 'Authorization': 'Bearer $token'};
          return (metodo == 'POST'
                  ? _cliente.post(_uri(path, query), headers: cabeceras, body: jsonEncode(cuerpo ?? {}))
                  : _cliente.get(_uri(path, query), headers: cabeceras))
              .timeout(_espera);
        },
        estado: (r) => r.statusCode,
        sinSesion: () => throw ParqueaderoApiException('Inicia sesión de nuevo.', codigo: 'SIN_SESION', estado: 401),
      );
    } on RenovacionNoDisponible catch (error) {
      throw ParqueaderoApiException(error.mensaje, codigo: 'SIN_CONEXION');
    }
    final datos = res.body.isEmpty ? null : jsonDecode(res.body);
    if (res.statusCode >= 400) {
      final mensaje = datos is Map ? (datos['mensaje'] ?? datos['message']) : null;
      throw ParqueaderoApiException(
          mensaje is String ? mensaje : (mensaje is List ? mensaje.join(' ') : 'Error del servidor (${res.statusCode}).'),
          codigo: datos is Map ? datos['codigo'] as String? : null,
          estado: res.statusCode,
          cuerpo: datos is Map<String, dynamic> ? datos : null);
    }
    return datos;
  }

  /// Los eventos próximos de la cartelera (pública).
  Future<List<EventoCartelera>> eventosProximos() async {
    final datos = await _pedir('GET', '/cartelera') as Map<String, dynamic>;
    return (datos['eventos'] as List)
        .cast<Map<String, dynamic>>()
        .where((e) => e['pasado'] != true)
        .map(EventoCartelera.desdeJson)
        .toList();
  }

  /// Pasos 1-2: zonas, espacios libres por tipo de vehículo y precio.
  Future<Map<String, dynamic>> disponibilidad(String eventoId) async =>
      await _pedir('GET', '/parqueaderos/eventos/$eventoId/disponibilidad') as Map<String, dynamic>;

  /// Pasos 3-4: retiene un espacio mientras se paga.
  Future<Map<String, dynamic>> reservar(String eventoId, {required String zonaId, required String placa, required String tipoVehiculo}) async =>
      await _pedir('POST', '/parqueaderos/eventos/$eventoId/reservas',
          cuerpo: {'zonaId': zonaId, 'placa': placa, 'tipoVehiculo': tipoVehiculo}) as Map<String, dynamic>;

  /// Pasos 5-9: cobra con el token de la pasarela (RNF-05) y entrega el QR.
  Future<Map<String, dynamic>> pagar(String reservaId, String token) async =>
      await _pedir('POST', '/parqueaderos/reservas/$reservaId/pagar', cuerpo: {'token': token}) as Map<String, dynamic>;

  Future<List<Map<String, dynamic>>> misReservas() async =>
      (await _pedir('GET', '/parqueaderos/reservas') as List).cast<Map<String, dynamic>>();
}

ParqueaderoApi parqueaderoApi = ParqueaderoApi();
