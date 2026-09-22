import 'dart:async';
import 'dart:convert';
import 'dart:math';
import 'package:flutter/foundation.dart';
import 'package:http/http.dart' as http;
import 'servidor.dart';
import 'sesion.dart';

typedef DatosPedido = Map<String, dynamic>;

class PedidosException implements Exception {
  PedidosException(this.mensaje, this.estado);
  final String mensaje;
  final int estado;
  @override
  String toString() => mensaje;
}

/// Igual que ReventaApi: Gateway único y renovación de sesión compartida.
class PedidosApi {
  PedidosApi({http.Client? cliente, Sesion? sesionActual})
      : _cliente = cliente ?? http.Client(),
        _sesion = sesionActual ?? sesion;
  final http.Client _cliente;
  final Sesion _sesion;
  static final instance = PedidosApi();

  Future<dynamic> _enviar(String ruta,
      {DatosPedido? cuerpo, String? clave}) async {
    try {
      final uri =
          Uri.parse('${Servidor.api}/${Servidor.prefijo}/pedidos/$ruta');
      final respuesta = await _sesion.conAcceso<http.Response>((token) {
        final headers = {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer $token',
          if (clave != null) 'Idempotency-Key': clave
        };
        return (cuerpo == null
                ? _cliente.get(uri, headers: headers)
                : _cliente.post(uri,
                    headers: headers, body: jsonEncode(cuerpo)))
            .timeout(const Duration(seconds: 20));
      },
          estado: (r) => r.statusCode,
          sinSesion: () => throw PedidosException(
              'Inicia sesión para hacer tu pedido.', 401));
      final datos = jsonDecode(utf8.decode(respuesta.bodyBytes));
      if (respuesta.statusCode >= 200 && respuesta.statusCode < 300) {
        return datos;
      }
      // Una respuesta incierta de pago también contiene un resultado; no perderlo.
      if ([502, 504].contains(respuesta.statusCode) &&
          datos is Map &&
          datos['estadoPago'] == 'FALLIDA' &&
          datos['transaccionId'] == clave &&
          ruta == '${datos['pedidoId']}/pagos') {
        return datos;
      }
      final codigo = datos is Map ? datos['codigo'] : null;
      const mensajes = {
        'INVENTARIO_INSUFICIENTE':
            'No quedan suficientes unidades. Ajusta tu selección.',
        'PRODUCTO_AGOTADO': 'Uno de los productos se agotó.',
        'PRODUCTO_INACTIVO': 'Uno de los productos ya no está disponible.',
        'INVENTARIO_NO_PREPARADO':
            'Este establecimiento aún no puede recibir pedidos.',
        'CHECKOUT_EXPIRADO': 'La reserva venció. Inicia un nuevo pedido.',
        'ESTABLECIMIENTO_NO_DISPONIBLE':
            'El establecimiento no está disponible.',
      };
      throw PedidosException(
          mensajes[codigo] ??
              'No se pudo completar la solicitud. Vuelve a intentar.',
          respuesta.statusCode);
    } on PedidosException {
      rethrow;
    } catch (_) {
      throw PedidosException('No pudimos conectar con el servidor.', 0);
    }
  }

  Future<
      List<
          DatosPedido>> recibidos(String establecimiento) async => (await _enviar(
              'establecimientos/${Uri.encodeComponent(establecimiento)}/pedidos')
          as List)
      .cast<DatosPedido>();

  Future<List<DatosPedido>> establecimientos(String evento) async =>
      (await _enviar('eventos/${Uri.encodeComponent(evento)}/establecimientos')
              as List)
          .cast<DatosPedido>();
  Future<
      List<
          DatosPedido>> productos(String establecimiento) async => (await _enviar(
              'establecimientos/${Uri.encodeComponent(establecimiento)}/productos')
          as List)
      .cast<DatosPedido>();
  Future<DatosPedido> checkout(String evento, String establecimiento,
          Map<String, int> cantidades) async =>
      await _enviar('checkout', cuerpo: {
        'eventoId': evento,
        'establecimientoId': establecimiento,
        'metodoEntrega': 'RECOGER',
        'productos': cantidades.entries
            .where((e) => e.value > 0)
            .map((e) => {'productoId': e.key, 'cantidad': e.value})
            .toList()
      }) as DatosPedido;
  Future<DatosPedido> pagar(String pedido, String clave) async =>
      await _enviar('${Uri.encodeComponent(pedido)}/pagos',
          clave: clave,
          cuerpo: {'tokenPago': 'tok_ok_pedidos_movil'}) as DatosPedido;
}

String nuevaClavePago() {
  final random = Random.secure();
  final bytes = List.generate(16, (_) => random.nextInt(256));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  final hex = bytes.map((b) => b.toRadixString(16).padLeft(2, '0')).join();
  return '${hex.substring(0, 8)}-${hex.substring(8, 12)}-${hex.substring(12, 16)}-${hex.substring(16, 20)}-${hex.substring(20)}';
}

/// Estado de presentación en memoria; no confirma ni calcula inventario o precios.
class CompraPedido extends ChangeNotifier {
  CompraPedido(this.api, this.evento, this.establecimiento);
  final PedidosApi api;
  final String evento;
  final String establecimiento;
  final cantidades = <String, int>{};
  DatosPedido? pedido;
  DatosPedido? pago;
  bool ocupado = false;
  bool incierto = false;
  String? mensaje;
  String? _clave;
  bool _cerrado = false;
  bool get confirmado => pago?['compraConfirmada'] == true;
  void _avisar() {
    if (!_cerrado) notifyListeners();
  }

  @override
  void dispose() {
    _cerrado = true;
    super.dispose();
  }

  void cambiar(String producto, int delta) {
    if (ocupado || pedido != null || incierto) return;
    cantidades[producto] = max(0, (cantidades[producto] ?? 0) + delta);
    _avisar();
  }

  Future<void> crear() async {
    if (ocupado ||
        pedido != null ||
        incierto ||
        !cantidades.values.any((n) => n > 0)) {
      return;
    }
    ocupado = true;
    mensaje = null;
    _avisar();
    try {
      pedido = await api.checkout(evento, establecimiento, cantidades);
    } catch (e) {
      incierto = e is! PedidosException || e.estado == 0 || e.estado >= 500;
      mensaje = incierto
          ? 'No pudimos confirmar la reserva. No repitas el pedido hasta revisar su estado.'
          : e.toString();
    } finally {
      ocupado = false;
      _avisar();
    }
  }

  Future<void> pagar() async {
    if (ocupado || pedido == null || confirmado) return;
    ocupado = true;
    mensaje = null;
    _avisar();
    try {
      _clave ??= nuevaClavePago();
      pago = await api.pagar(pedido!['id'] as String, _clave!);
      if (pago!['estadoPago'] == 'RECHAZADA') {
        _clave = null;
        mensaje = 'Pago rechazado. Puedes intentar nuevamente.';
      } else if (!confirmado) {
        mensaje =
            'El pago está pendiente de resolución. Puedes volver a consultar el mismo intento.';
      }
    } catch (e) {
      mensaje =
          '${e is PedidosException ? e.mensaje : 'No se confirmó el pago.'} Reintentar consultará el mismo intento de forma segura.';
    } finally {
      ocupado = false;
      _avisar();
    }
  }
}
