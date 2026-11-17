// Boletería del cliente (CU-001 a CU-005) contra Boletería, por el API
// Gateway: el mismo contrato que usa el portal web (RNF-14). La app no
// calcula precios, descuentos ni reembolsos: los pide al servidor y los
// muestra. Así no hay reglas de negocio duplicadas en el cliente.
import 'dart:async';
import 'dart:convert';

import 'package:http/http.dart' as http;

import 'servidor.dart';
import 'sesion.dart';

class BoleteriaApiException implements Exception {
  BoleteriaApiException(this.mensaje, {this.codigo, this.estado = 0, this.cuerpo});
  final String mensaje;
  final String? codigo;
  final int estado;
  final Map<String, dynamic>? cuerpo;
  @override
  String toString() => mensaje;
}

/// Un evento del listado, tal como lo devuelve `GET /cartelera` (CU-005).
class EventoResumen {
  EventoResumen({
    required this.id,
    required this.nombre,
    required this.categoria,
    required this.fechaInicio,
    required this.lugar,
    required this.ciudad,
    required this.precioDesde,
    required this.agotado,
    required this.pasado,
  });

  factory EventoResumen.desdeJson(Map<String, dynamic> j) => EventoResumen(
        id: j['id'] as String,
        nombre: j['nombre'] as String,
        categoria: j['categoria'] as String? ?? 'Otro',
        fechaInicio: DateTime.parse(j['fechaInicio'] as String).toLocal(),
        lugar: j['lugar'] as String? ?? '',
        ciudad: j['ciudad'] as String? ?? '',
        precioDesde: (j['precioDesde'] as num?)?.round(),
        agotado: j['agotado'] == true,
        pasado: j['pasado'] == true,
      );

  final String id, nombre, categoria, lugar, ciudad;
  final DateTime fechaInicio;
  final int? precioDesde;
  final bool agotado, pasado;
}

/// Un tipo de entrada del evento, con el cupo al momento (CU-005, pasos 6-8).
class Localidad {
  Localidad({required this.id, required this.nombre, required this.precio, required this.disponibles, required this.agotada});

  factory Localidad.desdeJson(Map<String, dynamic> j) => Localidad(
        id: j['id'] as String,
        nombre: j['nombre'] as String,
        precio: (j['precio'] as num).round(),
        disponibles: (j['disponibles'] as num?)?.toInt() ?? 0,
        agotada: j['agotada'] == true,
      );

  final String id, nombre;
  final int precio, disponibles;
  final bool agotada;
}

class EventoDetalle {
  EventoDetalle(this.evento, this.localidades);
  final EventoResumen evento;
  final List<Localidad> localidades;
}

class BoleteriaApi {
  BoleteriaApi({http.Client? cliente, Sesion? sesionActual, this.esperaEntreTurnos})
      : _cliente = cliente ?? http.Client(),
        _sesion = sesionActual ?? sesion;

  final http.Client _cliente;
  final Sesion _sesion;

  /// Solo para pruebas: cuánto esperar antes de volver a pedir turno.
  final Duration? esperaEntreTurnos;
  static const _espera = Duration(seconds: 20);

  Uri _uri(String path, [Map<String, String>? query]) =>
      Uri.parse('${Servidor.api}/${Servidor.prefijo}$path').replace(queryParameters: query);

  Future<dynamic> _pedir(
    String metodo,
    String path, {
    Object? cuerpo,
    Map<String, String>? query,
    Map<String, String> cabecerasExtra = const {},
  }) async {
    final http.Response res;
    try {
      res = await _sesion.conAcceso<http.Response>(
        (token) {
          final peticion = http.Request(metodo, _uri(path, query))
            ..headers.addAll({'Content-Type': 'application/json', 'Authorization': 'Bearer $token', ...cabecerasExtra});
          if (cuerpo != null) peticion.body = jsonEncode(cuerpo);
          return _cliente.send(peticion).then(http.Response.fromStream).timeout(_espera);
        },
        estado: (r) => r.statusCode,
        sinSesion: () => throw BoleteriaApiException('Inicia sesión de nuevo.', codigo: 'SIN_SESION', estado: 401),
      );
    } on RenovacionNoDisponible catch (error) {
      throw BoleteriaApiException(error.mensaje, codigo: 'SIN_CONEXION');
    } on TimeoutException {
      throw BoleteriaApiException('El servidor tardó demasiado en responder. Inténtalo de nuevo.', codigo: 'SIN_CONEXION');
    } on http.ClientException {
      throw BoleteriaApiException('No se pudo conectar con el servidor. Revisa tu conexión.', codigo: 'SIN_CONEXION');
    }
    final datos = res.body.isEmpty ? null : jsonDecode(utf8.decode(res.bodyBytes));
    if (res.statusCode >= 400) {
      final mensaje = datos is Map ? (datos['mensaje'] ?? datos['message']) : null;
      throw BoleteriaApiException(
        mensaje is String ? mensaje : (mensaje is List ? mensaje.join(' ') : 'Error del servidor (${res.statusCode}).'),
        codigo: datos is Map ? (datos['codigo'] ?? datos['error']) as String? : null,
        estado: res.statusCode,
        cuerpo: datos is Map<String, dynamic> ? datos : null,
      );
    }
    return datos;
  }

  // --- CU-005: cartelera -----------------------------------------------------

  /// La cartelera completa, pasados incluidos (la lista los separa).
  Future<List<EventoResumen>> cartelera() async {
    final datos = await _pedir('GET', '/cartelera', query: {'incluirPasados': 'true', 'limite': '100'}) as Map<String, dynamic>;
    return (datos['eventos'] as List).cast<Map<String, dynamic>>().map(EventoResumen.desdeJson).toList();
  }

  /// El detalle con sus localidades, precios y cupos al momento.
  Future<EventoDetalle> detalleEvento(String id) async {
    final datos = await _pedir('GET', '/cartelera/$id') as Map<String, dynamic>;
    return EventoDetalle(
      EventoResumen.desdeJson(datos),
      ((datos['localidades'] as List?) ?? []).cast<Map<String, dynamic>>().map(Localidad.desdeJson).toList(),
    );
  }

  // --- CU-001: comprar -------------------------------------------------------

  /// Cola virtual (ADR-15): el gateway no deja reservar sin turno. Si hay fila,
  /// espera lo que diga el servidor y avisa el puesto con [enEspera].
  Future<String> turno(String eventoId, {void Function(int posicion)? enEspera}) async {
    for (;;) {
      final t = await _pedir('POST', '/cola/eventos/$eventoId/turnos', cuerpo: const {}) as Map<String, dynamic>;
      if (t['estado'] == 'ADMITIDO' && t['token'] is String) return t['token'] as String;
      enEspera?.call((t['posicion'] as num?)?.toInt() ?? 0);
      await Future<void>.delayed(esperaEntreTurnos ?? Duration(seconds: (t['reintentarEnSegundos'] as num?)?.toInt() ?? 3));
    }
  }

  /// Pasos 3-4: pasa por la fila y aparta el cupo. El total lo calcula el servidor.
  Future<Map<String, dynamic>> reservar(String eventoId, String localidadId, int cantidad,
      {void Function(int posicion)? enEspera}) async {
    final token = await turno(eventoId, enEspera: enEspera);
    return await _pedir('POST', '/compras',
        cuerpo: {'localidadId': localidadId, 'cantidad': cantidad},
        cabecerasExtra: {'X-Turno-Cola': token}) as Map<String, dynamic>;
  }

  /// CU-004: valida el código en el servidor y devuelve la compra con el total nuevo.
  Future<Map<String, dynamic>> aplicarCupon(String compraId, String codigo) async =>
      await _pedir('PUT', '/compras/$compraId/cupon', cuerpo: {'codigo': codigo.trim()}) as Map<String, dynamic>;

  /// CU-004B: quita el código y recalcula sin descuento.
  Future<Map<String, dynamic>> quitarCupon(String compraId) async =>
      await _pedir('DELETE', '/compras/$compraId/cupon') as Map<String, dynamic>;

  /// Pasos 5-8: cobra con el token de la pasarela (RNF-05) y emite las entradas con su QR.
  Future<Map<String, dynamic>> pagar(String compraId, {required String metodoPago, required String token}) async =>
      await _pedir('POST', '/compras/$compraId/pagar', cuerpo: {'metodoPago': metodoPago, 'token': token}) as Map<String, dynamic>;

  // --- CU-002: mis entradas y su QR -----------------------------------------

  /// Las compras de la cuenta, las más recientes primero (sin entradas).
  Future<List<Map<String, dynamic>>> misCompras() async =>
      (await _pedir('GET', '/compras') as List).cast<Map<String, dynamic>>();

  /// Una compra con sus entradas y QR (solo las que siguen siendo de quien pregunta).
  Future<Map<String, dynamic>> compra(String compraId) async =>
      await _pedir('GET', '/compras/$compraId') as Map<String, dynamic>;

  // --- CU-003: cancelar ------------------------------------------------------

  /// Pasos 2-4: qué se puede cancelar y cuánto se devolvería, sin cambiar nada.
  Future<Map<String, dynamic>> cotizarCancelacion(String compraId, {List<String>? entradaIds}) async =>
      await _pedir('POST', '/compras/$compraId/cancelacion/cotizacion',
          cuerpo: {if (entradaIds != null) 'entradaIds': entradaIds}) as Map<String, dynamic>;

  /// Pasos 5-9: con el monto que la persona aceptó, reembolsa y anula las entradas.
  Future<Map<String, dynamic>> cancelar(String compraId,
          {required String motivo, required num montoAceptado, List<String>? entradaIds}) async =>
      await _pedir('POST', '/compras/$compraId/cancelaciones', cuerpo: {
        'motivo': motivo.trim(),
        'montoAceptado': montoAceptado,
        if (entradaIds != null) 'entradaIds': entradaIds,
      }) as Map<String, dynamic>;

  // --- CU-002: validar el QR en la puerta (personal de ingreso) -------------

  /// CU-002, pasos 2-10, del lado del personal de ingreso: el servidor valida
  /// que el QR sea de este evento, que no esté usado ni anulado y que haya
  /// aforo; si todo cuadra, registra la hora y marca el QR como usado. Los
  /// rechazos llegan como [BoleteriaApiException] con `CU-002A`, `B` o `D`.
  Future<Map<String, dynamic>> validarIngreso(String eventoId, String codigoQr) async =>
      await _pedir('POST', '/ingresos', cuerpo: {'eventoId': eventoId, 'codigoQr': codigoQr.trim()}) as Map<String, dynamic>;

  /// CU-002E: los hashes de los QR que hoy pueden ingresar, para validar sin red.
  Future<Map<String, dynamic>> cacheIngresos(String eventoId) async =>
      await _pedir('GET', '/ingresos/eventos/$eventoId/cache') as Map<String, dynamic>;

  /// CU-002E: sube los ingresos hechos sin red (`codigoQr`, `escaneadoEn`). Lo
  /// que no pase las reglas vuelve en `resultados` como conflicto, no se pierde.
  Future<Map<String, dynamic>> sincronizarIngresos(String eventoId, List<Map<String, dynamic>> ingresos) async =>
      await _pedir('POST', '/ingresos/sincronizacion', cuerpo: {'eventoId': eventoId, 'ingresos': ingresos})
          as Map<String, dynamic>;
}

BoleteriaApi boleteriaApi = BoleteriaApi();
