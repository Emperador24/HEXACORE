// Cliente de la evacuación (CU-010) y del parqueadero (CU-022 a CU-025) para el
// personal, contra el Núcleo a través del API Gateway — igual que
// `logistica_api_client.dart`: el token es el de la sesión de quien usa la
// app y el servidor decide qué puede hacer según su rol.
import 'dart:convert';

import 'package:http/http.dart' as http;

import 'servidor.dart';
import 'sesion.dart';

class OperacionApiException implements Exception {
  OperacionApiException(this.message, {this.codigo, this.estado = 0});
  final String message;
  final String? codigo;
  final int estado;
  @override
  String toString() => message;
}

class OperacionApi {
  OperacionApi({http.Client? cliente}) : _cliente = cliente ?? http.Client();

  final http.Client _cliente;
  static const _espera = Duration(seconds: 15);

  Uri _uri(String path) => Uri.parse('${Servidor.api}/${Servidor.prefijo}$path');

  Future<dynamic> _pedir(String metodo, String path, [Map<String, dynamic>? cuerpo]) async {
    final http.Response res;
    try {
      res = await sesion.conAcceso<http.Response>(
        (token) {
          final cabeceras = {'Content-Type': 'application/json', 'Authorization': 'Bearer $token'};
          final body = cuerpo == null ? null : jsonEncode(cuerpo);
          return switch (metodo) {
            'POST' => _cliente.post(_uri(path), headers: cabeceras, body: body ?? '{}'),
            'PATCH' => _cliente.patch(_uri(path), headers: cabeceras, body: body ?? '{}'),
            _ => _cliente.get(_uri(path), headers: cabeceras),
          }.timeout(_espera);
        },
        estado: (r) => r.statusCode,
        sinSesion: () => throw OperacionApiException('Inicia sesión de nuevo.', codigo: 'SIN_SESION', estado: 401),
      );
    } on RenovacionNoDisponible catch (error) {
      throw OperacionApiException(error.mensaje, codigo: 'SIN_CONEXION');
    }
    final datos = res.body.isEmpty ? null : jsonDecode(res.body);
    if (res.statusCode >= 400) {
      final mensaje = datos is Map ? (datos['mensaje'] ?? datos['message']) : null;
      throw OperacionApiException(
          mensaje is String ? mensaje : (mensaje is List ? mensaje.join(' ') : 'Error del servidor (${res.statusCode}).'),
          codigo: datos is Map ? datos['codigo'] as String? : null,
          estado: res.statusCode);
    }
    return datos;
  }

  // --- CU-010 ---------------------------------------------------------------

  /// La evacuación activa del evento, o `null` si no hay ninguna.
  Future<Map<String, dynamic>?> evacuacionActiva(String eventoId) async {
    final r = await _pedir('GET', '/emergencias/eventos/$eventoId/activa') as Map<String, dynamic>;
    return r['activa'] as Map<String, dynamic>?;
  }

  /// Paso 10: cuántas personas quedan en una zona, o que ya está evacuada.
  Future<Map<String, dynamic>> reportarZona(String evacuacionId, String zonaId, {int? personasRestantes, bool evacuada = false}) async =>
      await _pedir('PATCH', '/emergencias/evacuaciones/$evacuacionId/zonas/$zonaId', {
        if (personasRestantes != null) 'personasRestantes': personasRestantes,
        if (evacuada) 'estado': 'EVACUADA',
      }) as Map<String, dynamic>;

  /// CU-010A: una salida no se puede usar.
  Future<Map<String, dynamic>> bloquearSalida(String evacuacionId, String salidaId, String motivo) async =>
      await _pedir('POST', '/emergencias/evacuaciones/$evacuacionId/salidas/$salidaId/bloqueo', {'bloqueada': true, 'motivo': motivo})
          as Map<String, dynamic>;

  // --- CU-024/025 -------------------------------------------------------------

  Future<List<dynamic>> zonasParqueadero(String eventoId) async => await _pedir('GET', '/parqueaderos/eventos/$eventoId/zonas') as List<dynamic>;

  Future<List<dynamic>> vehiculosEnLote(String eventoId) async => await _pedir('GET', '/parqueaderos/eventos/$eventoId/vehiculos') as List<dynamic>;

  /// CU-025, paso 7: la zona que se indica a quien entra.
  Future<Map<String, dynamic>> recomendacion(String eventoId) async =>
      await _pedir('GET', '/parqueaderos/eventos/$eventoId/recomendacion') as Map<String, dynamic>;

  /// CU-022: ingreso por el QR de la reserva o por la placa; el servidor
  /// asigna el espacio (CU-023) y decide si viene prepagada.
  Future<Map<String, dynamic>> registrarIngreso(String eventoId,
          {String? placa, String? codigoQr, String tipoVehiculo = 'AUTOMOVIL', String? zonaId}) async =>
      await _pedir('POST', '/parqueaderos/eventos/$eventoId/ingresos', {
        if (placa != null) 'placa': placa,
        if (codigoQr != null) 'codigoQr': codigoQr,
        'tipoVehiculo': tipoVehiculo,
        if (zonaId != null) 'zonaId': zonaId,
      }) as Map<String, dynamic>;

  /// CU-022 y CU-024: registra la salida, libera el espacio y devuelve el cobro.
  Future<Map<String, dynamic>> registrarSalida(String eventoId, {String? placa, String? codigoQr}) async =>
      await _pedir('POST', '/parqueaderos/eventos/$eventoId/salidas', {
        if (placa != null) 'placa': placa,
        if (codigoQr != null) 'codigoQr': codigoQr,
      }) as Map<String, dynamic>;

  /// CU-022, offline-first: lo que el punto de control guarda para validar sin red.
  Future<Map<String, dynamic>> cacheParqueadero(String eventoId) async =>
      await _pedir('GET', '/parqueaderos/eventos/$eventoId/cache') as Map<String, dynamic>;

  /// CU-022, offline-first: envía lo registrado sin red; reenviar no duplica.
  Future<Map<String, dynamic>> sincronizarParqueadero(String eventoId, List<Map<String, dynamic>> registros) async =>
      await _pedir('POST', '/parqueaderos/eventos/$eventoId/sincronizacion', {'registros': registros}) as Map<String, dynamic>;
}

OperacionApi operacionApi = OperacionApi();
