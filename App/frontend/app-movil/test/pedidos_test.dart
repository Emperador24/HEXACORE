import 'dart:convert';
import 'package:flutter_test/flutter_test.dart';
import 'package:hexacore_app/services/pedidos_api.dart';
import 'package:hexacore_app/services/sesion.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

class ApiPrueba extends PedidosApi {
  final claves = <String>[];
  String resultado = 'APROBADA';
  bool error = false;
  @override
  Future<DatosPedido> checkout(String e, String l, Map<String, int> c) async {
    if (error) throw PedidosException('Sin stock', 409);
    return {'id': 'pedido', 'total': '25000.00'};
  }

  @override
  Future<DatosPedido> pagar(String pedido, String clave) async {
    claves.add(clave);
    if (error) throw PedidosException('Sin conexión', 0);
    return {
      'estadoPago': resultado,
      'compraConfirmada': resultado == 'APROBADA',
      'codigoQr': 'qr-backend'
    };
  }
}

void main() {
  test('UUID v4 válido y distinto por intento', () {
    final clave = nuevaClavePago();
    expect(
        clave,
        matches(RegExp(
            r'^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$')));
    expect(nuevaClavePago(), isNot(clave));
  });
  test(
      'catálogo, checkout y pago usan Gateway, sesión y solo el contrato permitido',
      () async {
    final sesion = Sesion(almacen: AlmacenMemoria());
    await sesion.abrir(
        tokens: TokensSesion(
            acceso: 'token',
            accesoExpiraEn: DateTime.now().add(const Duration(hours: 1)),
            renovacion: 'renovacion',
            renovacionExpiraEn: DateTime.now().add(const Duration(days: 1))),
        usuario: const UsuarioSesion(
            id: 'cliente', nombre: 'Ana', email: 'a@b.co', roles: ['Cliente']));
    final peticiones = <http.Request>[];
    final api = PedidosApi(
        sesionActual: sesion,
        cliente: MockClient((r) async {
          peticiones.add(r);
          expect(r.headers['Authorization'], 'Bearer token');
          expect(r.url.path, startsWith('/api/v1/pedidos/'));
          return http.Response(
              r.method == 'GET' ? '[]' : '{"id":"pedido"}', 200);
        }));
    await api.establecimientos('evento');
    await api.productos('local');
    await api.checkout('evento', 'local', {'producto': 2, 'otro': 0});
    expect(jsonDecode(peticiones[2].body), {
      'eventoId': 'evento',
      'establecimientoId': 'local',
      'metodoEntrega': 'RECOGER',
      'productos': [
        {'productoId': 'producto', 'cantidad': 2}
      ]
    });
    final clave = nuevaClavePago();
    await api.pagar('pedido', clave);
    expect(peticiones.last.headers['Idempotency-Key'], clave);
    expect(jsonDecode(peticiones.last.body),
        {'tokenPago': 'tok_ok_pedidos_movil'});
    await api.recibidos('local');
    expect(peticiones.last.method, 'GET');
    expect(peticiones.last.url.path,
        '/api/v1/pedidos/establecimientos/local/pedidos');
    expect(peticiones.last.body, isEmpty);
    await api.menu('local');
    expect(peticiones.last.method, 'GET');
    expect(peticiones.last.url.path, '/api/v1/pedidos/establecimientos/local/menu');
    await api.actualizarDisponibilidad('local', 'producto', false);
    expect(peticiones.last.method, 'PATCH');
    expect(peticiones.last.url.path, '/api/v1/pedidos/establecimientos/local/productos/producto');
    expect(jsonDecode(peticiones.last.body), {'activo': false});
  });
  test('confirmación y QR provienen del backend; no cobra otra vez', () async {
    final api = ApiPrueba();
    final compra = CompraPedido(api, 'evento', 'local');
    compra.cambiar('producto', 1);
    await compra.crear();
    await compra.pagar();
    await compra.pagar();
    expect(compra.confirmado, true);
    expect(compra.pago!['codigoQr'], 'qr-backend');
    expect(api.claves.length, 1);
    compra.dispose();
  });
  test('error de pago conserva clave y rechazo permite una nueva', () async {
    final api = ApiPrueba();
    final compra = CompraPedido(api, 'evento', 'local');
    compra.cambiar('producto', 1);
    await compra.crear();
    api.error = true;
    await compra.pagar();
    api.error = false;
    api.resultado = 'RECHAZADA';
    await compra.pagar();
    expect(api.claves[0], api.claves[1]);
    expect(compra.confirmado, false);
    api.resultado = 'APROBADA';
    await compra.pagar();
    expect(api.claves[2], isNot(api.claves[1]));
    compra.dispose();
  });
  test('rechazo de stock conserva selección y no crea compra', () async {
    final api = ApiPrueba()..error = true;
    final compra = CompraPedido(api, 'evento', 'local');
    compra.cambiar('producto', 2);
    await compra.crear();
    expect(compra.pedido, isNull);
    expect(compra.incierto, false);
    expect(compra.cantidades['producto'], 2);
    compra.dispose();
  });
  test('resultado incierto conserva la clave sin confirmar la compra',
      () async {
    final api = ApiPrueba()..resultado = 'FALLIDA';
    final compra = CompraPedido(api, 'evento', 'local');
    compra.cambiar('producto', 1);
    await compra.crear();
    await compra.pagar();
    expect(compra.confirmado, false);
    api.resultado = 'PENDIENTE';
    await compra.pagar();
    expect(api.claves[0], api.claves[1]);
    expect(compra.confirmado, false);
    compra.dispose();
  });

  test('clics simultáneos solo inician un pago', () async {
    final api = ApiPrueba();
    final compra = CompraPedido(api, 'evento', 'local');
    compra.cambiar('producto', 1);
    await compra.crear();
    await Future.wait([compra.pagar(), compra.pagar()]);
    expect(api.claves.length, 1);
    compra.dispose();
  });
}
