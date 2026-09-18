import 'dart:convert';

import 'package:http/http.dart' as http;

import 'servidor.dart';
import 'sesion.dart';

/// Cliente del Servicio de Entradas y Mercado Secundario (CU-006).
///
/// En producción estas peticiones van al **API Gateway** (ADR-02); en
/// desarrollo se habla directo con el microservicio. La dirección la resuelve
/// [Servidor].
///
/// Todas las peticiones llevan el token de la sesión (RNF-06). Si el servidor
/// responde 401, la sesión se cierra y la app vuelve al login.
///
/// Cubre los pasos 1 a 11 del CU-006 —publicar, consultar el mercado,
/// reservar, pagar y recibir el QR nuevo— y los caminos alternos CU-006A,
/// CU-006B y CU-006C. Notificar y liquidar (pasos 12-13) son asíncronos y no
/// pasan por aquí: salen por la cola de mensajes del backend.

/// Error devuelto por el backend, con el código del camino del CU-006.
///
/// El `mensaje` viene del servidor y se muestra tal cual. No se traduce ni se
/// reconstruye aquí a partir del `codigo`: eso duplicaría en el cliente reglas
/// que son del dominio, y RNF-14 exige *"0 reglas de negocio duplicadas en el
/// cliente"*. El `codigo` queda disponible por si alguna pantalla necesita
/// reaccionar distinto (p. ej. refrescar la lista si la entrada ya cambió).
class ReventaApiException implements Exception {
  ReventaApiException(this.codigo, this.mensaje, this.estadoHttp);

  final String codigo;
  final String mensaje;
  final int estadoHttp;

  @override
  String toString() => mensaje;
}

/// Una publicación en el mercado secundario.
class Publicacion {
  Publicacion({
    required this.id,
    required this.entradaId,
    required this.precio,
    required this.precioOriginal,
    required this.estado,
    required this.fechaExpiracion,
  });

  factory Publicacion.desdeJson(Map<String, dynamic> json) => Publicacion(
        id: json['id'] as String,
        entradaId: json['entradaId'] as String,
        precio: (json['precio'] as num).toDouble(),
        precioOriginal: (json['precioOriginal'] as num).toDouble(),
        estado: json['estado'] as String,
        fechaExpiracion: DateTime.parse(json['fechaExpiracion'] as String),
      );

  final String id;
  final String entradaId;
  final double precio;
  final double precioOriginal;
  final String estado;
  final DateTime fechaExpiracion;
}

/// Una entrada de la cuenta del usuario, con el veredicto de si puede publicarse.
///
/// `puedePublicarse`, `motivoBloqueo` y `precioMaximo` los calcula el backend.
/// La app no decide si una entrada es revendible: lo pinta.
class EntradaPropia {
  EntradaPropia({
    required this.id,
    required this.numeroTicket,
    required this.eventoNombre,
    required this.lugar,
    required this.localidadNombre,
    required this.precioOriginal,
    required this.estado,
    required this.fechaEvento,
    required this.puedePublicarse,
    required this.motivoBloqueo,
    required this.detalleBloqueo,
    required this.precioMaximo,
    required this.publicacion,
  });

  factory EntradaPropia.desdeJson(Map<String, dynamic> json) {
    final publicacion = json['publicacion'] as Map<String, dynamic>?;
    return EntradaPropia(
      id: json['id'] as String,
      numeroTicket: json['numeroTicket'] as String,
      eventoNombre: json['eventoNombre'] as String,
      lugar: json['lugar'] as String? ?? '',
      localidadNombre: json['localidadNombre'] as String,
      precioOriginal: (json['precioOriginal'] as num).toDouble(),
      estado: json['estado'] as String,
      fechaEvento: DateTime.parse(json['fechaEvento'] as String),
      puedePublicarse: json['puedePublicarse'] as bool,
      motivoBloqueo: json['motivoBloqueo'] as String?,
      detalleBloqueo: json['detalleBloqueo'] as String?,
      precioMaximo: (json['precioMaximo'] as num?)?.toDouble(),
      publicacion:
          publicacion == null ? null : Publicacion.desdeJson(publicacion),
    );
  }

  final String id;
  final String numeroTicket;
  final String eventoNombre;
  final String lugar;
  final String localidadNombre;
  final double precioOriginal;
  final String estado;
  final DateTime fechaEvento;
  final bool puedePublicarse;
  final String? motivoBloqueo;
  final String? detalleBloqueo;
  final double? precioMaximo;
  final Publicacion? publicacion;

  bool get estaEnVenta => publicacion != null;
}

/// Cómo ordenar el mercado. Los valores son los que acepta el backend.
enum OrdenMercado {
  recientes('recientes', 'Más recientes'),
  precioAsc('precio_asc', 'Precio: menor primero'),
  precioDesc('precio_desc', 'Precio: mayor primero'),
  eventoProximo('evento_proximo', 'Evento más próximo');

  const OrdenMercado(this.valor, this.etiqueta);
  final String valor;
  final String etiqueta;
}

/// Una publicación vista desde el lado del comprador.
///
/// No trae el identificador del vendedor: el backend no lo expone a quien
/// compra. Por eso la tarjeta del mercado habla del evento y la localidad, no
/// de quién vende.
class PublicacionMercado {
  PublicacionMercado({
    required this.id,
    required this.entradaId,
    required this.precio,
    required this.precioOriginal,
    required this.estado,
    required this.eventoId,
    required this.eventoNombre,
    required this.lugar,
    required this.ciudad,
    required this.localidadNombre,
    required this.fechaEvento,
    required this.fechaExpiracion,
    required this.esPropia,
  });

  factory PublicacionMercado.desdeJson(Map<String, dynamic> json) =>
      PublicacionMercado(
        id: json['id'] as String,
        entradaId: json['entradaId'] as String,
        precio: (json['precio'] as num).toDouble(),
        precioOriginal: (json['precioOriginal'] as num).toDouble(),
        estado: json['estado'] as String,
        eventoId: json['eventoId'] as String,
        eventoNombre: json['eventoNombre'] as String,
        lugar: json['lugar'] as String? ?? '',
        ciudad: json['ciudad'] as String? ?? '',
        localidadNombre: json['localidadNombre'] as String,
        fechaEvento: DateTime.parse(json['fechaEvento'] as String),
        fechaExpiracion: DateTime.parse(json['fechaExpiracion'] as String),
        esPropia: json['esPropia'] as bool,
      );

  final String id;
  final String entradaId;
  final double precio;
  final double precioOriginal;
  final String estado;
  final String eventoId;
  final String eventoNombre;
  final String lugar;
  final String ciudad;
  final String localidadNombre;
  final DateTime fechaEvento;
  final DateTime fechaExpiracion;
  final bool esPropia;

  /// Cuánto se ahorra frente al precio original, o null si no hay ahorro.
  /// Es presentación, no una regla: solo compara dos cifras que da el backend.
  double? get ahorro =>
      precio < precioOriginal ? precioOriginal - precio : null;

  bool get sigueDisponible => estado == 'ACTIVA';
}

/// Una página del mercado.
class Mercado {
  Mercado({required this.publicaciones, required this.total});

  factory Mercado.desdeJson(Map<String, dynamic> json) => Mercado(
        publicaciones: (json['publicaciones'] as List<dynamic>)
            .map((p) => PublicacionMercado.desdeJson(p as Map<String, dynamic>))
            .toList(),
        total: json['total'] as int,
      );

  final List<PublicacionMercado> publicaciones;
  final int total;
}

/// Una reserva abierta sobre una publicación: mientras dure, nadie más puede
/// comprarla (paso 6 del CU-006).
class Checkout {
  Checkout({
    required this.id,
    required this.numeroTransaccion,
    required this.publicacionId,
    required this.estado,
    required this.precio,
    required this.comision,
    required this.netoVendedor,
    required this.segundosRestantes,
    required this.publicacion,
  });

  factory Checkout.desdeJson(Map<String, dynamic> json) => Checkout(
        id: json['id'] as String,
        numeroTransaccion: json['numeroTransaccion'] as String,
        publicacionId: json['publicacionId'] as String,
        estado: json['estado'] as String,
        precio: (json['precio'] as num).toDouble(),
        comision: (json['comision'] as num).toDouble(),
        netoVendedor: (json['netoVendedor'] as num).toDouble(),
        segundosRestantes: json['segundosRestantes'] as int,
        publicacion: PublicacionMercado.desdeJson(
            json['publicacion'] as Map<String, dynamic>),
      );

  final String id;
  final String numeroTransaccion;
  final String publicacionId;
  final String estado;
  final double precio;
  final double comision;
  final double netoVendedor;
  final int segundosRestantes;
  final PublicacionMercado publicacion;
}

/// Lo que devuelve una compra completada: las dos SALIDAS que declara el
/// CU-006 —confirmación de la transferencia y nuevo código QR— más lo que la
/// pantalla necesita para mostrar el comprobante.
class ResultadoCompra {
  ResultadoCompra({
    required this.numeroTransaccion,
    required this.codigoQr,
    required this.numeroTicket,
    required this.eventoNombre,
    required this.localidadNombre,
    required this.precio,
  });

  factory ResultadoCompra.desdeJson(Map<String, dynamic> json) =>
      ResultadoCompra(
        numeroTransaccion: json['numeroTransaccion'] as String,
        codigoQr: json['codigoQr'] as String,
        numeroTicket: json['numeroTicket'] as String,
        eventoNombre: json['eventoNombre'] as String,
        localidadNombre: json['localidadNombre'] as String,
        precio: (json['precio'] as num).toDouble(),
      );

  final String numeroTransaccion;
  final String codigoQr;
  final String numeroTicket;
  final String eventoNombre;
  final String localidadNombre;
  final double precio;
}

class ReventaApi {
  ReventaApi._();
  static final ReventaApi instance = ReventaApi._();

  /// Cliente reutilizado para aprovechar keep-alive entre peticiones.
  final http.Client _cliente = http.Client();

  /// Corta la espera si el backend no responde, en vez de dejar la pantalla
  /// colgada indefinidamente.
  static const _espera = Duration(seconds: 10);

  Uri _uri(String ruta) =>
      Uri.parse('${Servidor.api}/${Servidor.prefijo}/$ruta');

  /// Envía la petición con el token de la sesión (CU-027 paso 9), que el
  /// servicio verifica por su cuenta. Sustituye a la antigua cabecera
  /// `X-Usuario-Id`, con la que cualquiera podía hacerse pasar por otra
  /// persona.
  ///
  /// [Sesion.conAcceso] renueva el token si está por caducar y repite la
  /// petición una vez si el servidor responde 401.
  Future<http.Response> _conSesion(
      Future<http.Response> Function(Map<String, String> cabeceras)
          enviar) async {
    try {
      return await sesion.conAcceso<http.Response>(
        (token) => enviar({
          'Content-Type': 'application/json',
          'Authorization': 'Bearer $token'
        }),
        estado: (r) => r.statusCode,
        sinSesion: () => throw ReventaApiException('SIN_SESION',
            'Inicia sesión para usar el mercado de reventa.', 401),
      );
    } on RenovacionNoDisponible catch (error) {
      throw ReventaApiException('SIN_CONEXION', error.mensaje, 0);
    }
  }

  /// Paso 1 del CU-006: las entradas de la cuenta, con su veredicto.
  Future<List<EntradaPropia>> misEntradas() async {
    final respuesta = await _conSesion((cabeceras) => _cliente
        .get(_uri('reventa/mis-entradas'), headers: cabeceras)
        .timeout(_espera));
    final cuerpo = _leer(respuesta);
    return (cuerpo as List<dynamic>)
        .map((e) => EntradaPropia.desdeJson(e as Map<String, dynamic>))
        .toList();
  }

  /// Paso 5 del CU-006: las entradas disponibles en el mercado.
  ///
  /// El backend ya excluye las publicaciones propias, las que no están activas
  /// y las que se salieron de su ventana de reventa (CU-006D): aquí no se
  /// filtra nada.
  Future<Mercado> consultarMercado({
    OrdenMercado orden = OrdenMercado.recientes,
    String? eventoId,
    int limite = 20,
    int desplazamiento = 0,
  }) async {
    final parametros = <String, String>{
      'orden': orden.valor,
      'limite': '$limite',
      'desplazamiento': '$desplazamiento',
      if (eventoId != null) 'eventoId': eventoId,
    };
    final respuesta = await _conSesion((cabeceras) => _cliente
        .get(_uri('reventa/publicaciones').replace(queryParameters: parametros),
            headers: cabeceras)
        .timeout(_espera));
    return Mercado.desdeJson(_leer(respuesta) as Map<String, dynamic>);
  }

  /// La otra mitad del paso 5: el detalle de la publicación elegida.
  ///
  /// Se vuelve a pedir al servidor en lugar de reutilizar lo que ya está en la
  /// lista: entre que se cargó el mercado y que alguien toca una tarjeta pueden
  /// pasar minutos, y en ese rato otra persona pudo comprarla o el vendedor
  /// retirarla. Esta llamada es la que trae el estado de ahora.
  Future<PublicacionMercado> detallePublicacion(String publicacionId) async {
    final respuesta = await _conSesion((cabeceras) => _cliente
        .get(_uri('reventa/publicaciones/$publicacionId'), headers: cabeceras)
        .timeout(_espera));
    return PublicacionMercado.desdeJson(
        _leer(respuesta) as Map<String, dynamic>);
  }

  /// Paso 6 del CU-006: reserva la publicación mientras se paga.
  ///
  /// Falla con el código `CU-006H` si otra persona la está comprando en ese
  /// mismo momento. Si quien pide ya tenía una reserva abierta sobre esta
  /// publicación, el backend le devuelve la suya en lugar de rechazarlo.
  Future<Checkout> iniciarCheckout(String publicacionId) async {
    final respuesta = await _conSesion((cabeceras) => _cliente
        .post(_uri('reventa/publicaciones/$publicacionId/checkout'),
            headers: cabeceras)
        .timeout(_espera));
    return Checkout.desdeJson(_leer(respuesta) as Map<String, dynamic>);
  }

  /// Pasos 7-11 del CU-006: cobrar y completar la transferencia.
  ///
  /// El [token] es un identificador opaco del medio de pago emitido por la
  /// pasarela. **Aquí nunca viajan datos de tarjeta**: RNF-05 exige que el
  /// cobro se delegue íntegramente a la pasarela, así que la app tokeniza
  /// contra ella y este servicio solo reenvía el token.
  ///
  /// Puede fallar con `CU-006G` (rechazado) o `CU-006I` (la pasarela no
  /// respondió, y entonces **no se sabe si se cobró**).
  Future<ResultadoCompra> pagar({
    required String checkoutId,
    required String metodoPago,
    required String token,
  }) async {
    final respuesta =
        // Más margen que el resto: al otro lado hay una pasarela de pagos, y
        // el backend ya tiene su propio timeout de 10 s contra ella. Cortar
        // antes que él dejaría al comprador sin saber en qué quedó el cobro.
        await _conSesion((cabeceras) => _cliente
            .post(_uri('reventa/checkout/$checkoutId/pagar'),
                headers: cabeceras,
                body: jsonEncode({'metodoPago': metodoPago, 'token': token}))
            .timeout(const Duration(seconds: 30)));
    return ResultadoCompra.desdeJson(_leer(respuesta) as Map<String, dynamic>);
  }

  /// Flujo alterno CU-006C: el comprador se arrepiente antes de pagar.
  ///
  /// Cancelar libera el bloqueo al instante y devuelve la entrada al mercado,
  /// en vez de dejarla reservada hasta que caduque la reserva.
  Future<Checkout> cancelarCheckout(String checkoutId) async {
    final respuesta = await _conSesion((cabeceras) => _cliente
        .delete(_uri('reventa/checkout/$checkoutId'), headers: cabeceras)
        .timeout(_espera));
    return Checkout.desdeJson(_leer(respuesta) as Map<String, dynamic>);
  }

  /// Pasos 3-4 del CU-006: publicar una entrada propia al precio indicado.
  Future<Publicacion> publicar(
      {required String entradaId, required double precio}) async {
    final respuesta = await _conSesion((cabeceras) => _cliente
        .post(_uri('reventa/publicaciones'),
            headers: cabeceras,
            body: jsonEncode({'entradaId': entradaId, 'precio': precio}))
        .timeout(_espera));
    return Publicacion.desdeJson(_leer(respuesta) as Map<String, dynamic>);
  }

  /// Flujo alterno CU-006A: cambiar el precio antes de que la compren.
  Future<Publicacion> cambiarPrecio(
      {required String publicacionId, required double precio}) async {
    final respuesta = await _conSesion((cabeceras) => _cliente
        .patch(_uri('reventa/publicaciones/$publicacionId'),
            headers: cabeceras, body: jsonEncode({'precio': precio}))
        .timeout(_espera));
    return Publicacion.desdeJson(_leer(respuesta) as Map<String, dynamic>);
  }

  /// Flujo alterno CU-006B: retirar la entrada del mercado secundario.
  Future<Publicacion> retirar(String publicacionId) async {
    final respuesta = await _conSesion((cabeceras) => _cliente
        .delete(_uri('reventa/publicaciones/$publicacionId'),
            headers: cabeceras)
        .timeout(_espera));
    return Publicacion.desdeJson(_leer(respuesta) as Map<String, dynamic>);
  }

  /// Decodifica la respuesta o lanza [ReventaApiException] con el código del backend.
  dynamic _leer(http.Response respuesta) {
    final texto = utf8.decode(respuesta.bodyBytes);
    final dynamic cuerpo = texto.isEmpty ? null : jsonDecode(texto);

    if (respuesta.statusCode >= 200 && respuesta.statusCode < 300) {
      return cuerpo;
    }

    // El token ya no vale (caducó, o se cerró la sesión en otro sitio): la app
    // vuelve al login. `sesion.caducada` no espera a nadie para avisar.
    if (respuesta.statusCode == 401) {
      final mensaje =
          cuerpo is Map<String, dynamic> ? cuerpo['mensaje'] as String? : null;
      sesion.caducada(mensaje ?? 'Tu sesión terminó. Inicia sesión de nuevo.');
    }

    if (cuerpo is Map<String, dynamic>) {
      // Los errores del CU-006 traen {codigo, mensaje}; los de validación de
      // NestJS traen {message: [...], error, statusCode}. Se contemplan los dos.
      final codigo = cuerpo['codigo'] as String?;
      if (codigo != null) {
        throw ReventaApiException(codigo,
            cuerpo['mensaje'] as String? ?? codigo, respuesta.statusCode);
      }
      final mensaje = cuerpo['message'];
      if (mensaje != null) {
        throw ReventaApiException(
            'VALIDACION',
            mensaje is List ? mensaje.join('\n') : mensaje.toString(),
            respuesta.statusCode);
      }
    }
    throw ReventaApiException('ERROR_${respuesta.statusCode}',
        'El servidor respondió ${respuesta.statusCode}.', respuesta.statusCode);
  }
}

final reventaApi = ReventaApi.instance;
