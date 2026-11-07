import 'package:flutter_test/flutter_test.dart';
import 'package:hexacore_app/services/punto_control_local.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// CU-022, offline-first: lo que decide el punto de control sin red.
void main() {
  const qr = 'HXP-ABCDEFGHJKLMNPQR';
  Map<String, dynamic> cache({int capacidad = 2, List<String> enLote = const []}) => {
        'generadoEn': DateTime.now().toIso8601String(),
        'reservas': [
          {'hashQr': PuntoControlLocal.hashQr(qr), 'placa': 'RES123', 'zona': 'A', 'espacio': 'A-01', 'estado': 'CONFIRMADA'},
        ],
        'enLote': [...enLote],
        'zonas': [
          {'id': 'z', 'nombre': 'A', 'capacidad': capacidad, 'ocupados': enLote.length, 'reservados': 1},
        ],
      };

  setUp(() => SharedPreferences.setMockInitialValues({}));

  test('sin caché no deja pasar a nadie', () async {
    final local = PuntoControlLocal('e1');
    await local.cargar();
    expect((await local.ingreso(placa: 'ABC123')).aceptado, isFalse);
    expect(local.pendientes, isEmpty);
  });

  test('un QR de reserva pagada entra una sola vez; uno desconocido se niega (CU-022B)', () async {
    final local = PuntoControlLocal('e1');
    await local.cargar();
    await local.guardarCache(cache());
    expect((await local.ingreso(codigoQr: 'HXP-ZZZZZZZZZZZZZZZZ')).aceptado, isFalse);
    final primero = await local.ingreso(codigoQr: qr.toLowerCase());
    expect(primero.aceptado, isTrue);
    expect(primero.placa, 'RES123');
    expect((await local.ingreso(codigoQr: qr)).aceptado, isFalse);
    expect(local.pendientes.single, containsPair('codigoQr', qr));
  });

  test('sin reserva entra si hay cupo y se niega con el lote lleno (CU-022A y C)', () async {
    final local = PuntoControlLocal('e1');
    await local.cargar();
    // Capacidad 2, una reservada: queda un cupo.
    await local.guardarCache(cache());
    expect((await local.ingreso(placa: 'abc-123')).aceptado, isTrue);
    expect((await local.ingreso(placa: 'ABC123')).aceptado, isFalse, reason: 'ya está dentro');
    expect((await local.ingreso(placa: 'XYZ987')).aceptado, isFalse, reason: 'sin cupo');
    // Al salir uno, vuelve a haber cupo.
    await local.salida('ABC123');
    expect((await local.ingreso(placa: 'XYZ987')).aceptado, isTrue);
  });

  test('la cola sobrevive al reinicio y se vacía con lo que el servidor procesó', () async {
    final local = PuntoControlLocal('e1');
    await local.cargar();
    await local.guardarCache(cache(capacidad: 5));
    await local.ingreso(placa: 'AAA111');
    await local.salida('AAA111');
    final reiniciado = PuntoControlLocal('e1');
    await reiniciado.cargar();
    expect(reiniciado.pendientes, hasLength(2));
    final ids = reiniciado.pendientes.map((r) => r['id'] as String).toList();
    expect(ids.every((id) => RegExp(r'^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$').hasMatch(id)), isTrue);
    final rechazados = await reiniciado.confirmarSincronizacion({
      'resultados': [
        {'id': ids[0], 'resultado': 'APLICADO'},
        {'id': ids[1], 'resultado': 'RECHAZADO', 'mensaje': 'x'},
      ],
    });
    expect(rechazados, hasLength(1));
    expect(reiniciado.pendientes, isEmpty);
  });
}
