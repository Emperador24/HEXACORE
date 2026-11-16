// CU-022, infraestructura no trivial: modo offline-first del punto de control
// del parqueadero. Guarda en el dispositivo la caché que entrega el servidor
// (hash de los QR vigentes, placas dentro, cupos por zona) y los registros
// hechos sin red, con su propio id y la hora real, para sincronizarlos al
// volver la conexión. El servidor reconoce un registro reenviado por su id y
// no lo aplica dos veces.
import 'dart:convert';
import 'dart:math';

import 'package:crypto/crypto.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Lo que se decidió sin red: si se deja pasar y por qué.
class DecisionLocal {
  DecisionLocal(this.aceptado, this.mensaje, {this.placa});
  final bool aceptado;
  final String mensaje;
  final String? placa;
}

class PuntoControlLocal {
  PuntoControlLocal(this.eventoId);
  final String eventoId;

  Map<String, dynamic>? _cache;
  List<Map<String, dynamic>> _pendientes = [];

  String get _llaveCache => 'parqueadero.cache.$eventoId';
  String get _llavePendientes => 'parqueadero.pendientes.$eventoId';

  List<Map<String, dynamic>> get pendientes => List.unmodifiable(_pendientes);
  DateTime? get cacheGeneradaEn => _cache == null ? null : DateTime.tryParse(_cache!['generadoEn'] as String? ?? '');

  Future<void> cargar() async {
    final prefs = await SharedPreferences.getInstance();
    final cache = prefs.getString(_llaveCache);
    _cache = cache == null ? null : jsonDecode(cache) as Map<String, dynamic>;
    _pendientes = (jsonDecode(prefs.getString(_llavePendientes) ?? '[]') as List).cast<Map<String, dynamic>>();
  }

  Future<void> guardarCache(Map<String, dynamic> cache) async {
    _cache = cache;
    // Lo registrado sin red y aún no sincronizado sigue contando sobre la caché nueva.
    for (final r in _pendientes) {
      _aplicar(r);
    }
    await (await SharedPreferences.getInstance()).setString(_llaveCache, jsonEncode(_cache));
  }

  static String hashQr(String codigo) => sha256.convert(utf8.encode(codigo.trim().toUpperCase())).toString();

  /// Paso 2 sin red: valida contra la caché y, si pasa, deja el registro en cola.
  Future<DecisionLocal> ingreso({String? placa, String? codigoQr, String tipoVehiculo = 'AUTOMOVIL'}) async {
    final cache = _cache;
    if (cache == null) return DecisionLocal(false, 'Sin conexión y sin datos guardados: no se puede validar.');
    final reservas = (cache['reservas'] as List).cast<Map<String, dynamic>>();
    final enLote = (cache['enLote'] as List).cast<String>();
    String? placaFinal = placa == null ? null : _normalizar(placa);
    if (codigoQr != null) {
      final hash = hashQr(codigoQr);
      final reserva = reservas.where((r) => r['hashQr'] == hash).firstOrNull;
      // CU-022B sin red: el QR no está entre las reservas pagadas conocidas.
      if (reserva == null) return DecisionLocal(false, 'QR no reconocido: ingreso negado.');
      if (reserva['estado'] != 'CONFIRMADA') return DecisionLocal(false, 'Esa reserva ya se usó para entrar.');
      placaFinal = reserva['placa'] as String;
    } else {
      final reserva = reservas.where((r) => r['placa'] == placaFinal && r['estado'] == 'CONFIRMADA').firstOrNull;
      // CU-022C sin red: sin reserva solo entra si la caché dice que hay cupo.
      if (reserva == null && _libres() <= 0) return DecisionLocal(false, 'Parqueadero lleno: ingreso negado.');
    }
    if (enLote.contains(placaFinal)) return DecisionLocal(false, 'El vehículo $placaFinal ya está dentro.');
    await _encolar({
      'tipo': 'INGRESO',
      if (codigoQr != null) 'codigoQr': codigoQr.trim().toUpperCase() else 'placa': placaFinal,
      'tipoVehiculo': tipoVehiculo,
    });
    return DecisionLocal(true, '$placaFinal registrado sin conexión; se sincroniza al volver la red.', placa: placaFinal);
  }

  Future<DecisionLocal> salida(String placa) async {
    await _encolar({'tipo': 'SALIDA', 'placa': _normalizar(placa)});
    return DecisionLocal(true, 'Salida de ${_normalizar(placa)} registrada sin conexión; el cobro se calcula al sincronizar.');
  }

  /// Quita de la cola lo que el servidor ya procesó (aplicado, repetido o rechazado).
  Future<List<Map<String, dynamic>>> confirmarSincronizacion(Map<String, dynamic> respuesta) async {
    final resultados = (respuesta['resultados'] as List).cast<Map<String, dynamic>>();
    final procesados = resultados.map((r) => r['id']).toSet();
    _pendientes = _pendientes.where((r) => !procesados.contains(r['id'])).toList();
    await _guardarPendientes();
    return resultados.where((r) => r['resultado'] == 'RECHAZADO').toList();
  }

  Future<void> _encolar(Map<String, dynamic> datos) async {
    final registro = {'id': _uuid(), ...datos, 'ocurridoEn': DateTime.now().toUtc().toIso8601String()};
    _pendientes = [..._pendientes, registro];
    _aplicar(registro);
    await _guardarPendientes();
  }

  /// Refleja un registro en la caché para que las siguientes decisiones lo tengan en cuenta.
  void _aplicar(Map<String, dynamic> r) {
    final cache = _cache;
    if (cache == null) return;
    final enLote = (cache['enLote'] as List).cast<String>().toList();
    final reservas = (cache['reservas'] as List).cast<Map<String, dynamic>>();
    final reserva = r['codigoQr'] != null
        ? reservas.where((x) => x['hashQr'] == hashQr(r['codigoQr'] as String)).firstOrNull
        : reservas.where((x) => x['placa'] == r['placa'] && x['estado'] == 'CONFIRMADA').firstOrNull;
    final placa = reserva?['placa'] as String? ?? r['placa'] as String?;
    if (placa == null) return;
    if (r['tipo'] == 'INGRESO') {
      if (!enLote.contains(placa)) enLote.add(placa);
      if (reserva != null) reserva['estado'] = 'USADA';
    } else {
      enLote.remove(placa);
    }
    cache['enLote'] = enLote;
  }

  int _libres() {
    final zonas = (_cache!['zonas'] as List).cast<Map<String, dynamic>>();
    final capacidad = zonas.fold<int>(0, (n, z) => n + (z['capacidad'] as num).toInt());
    final reservadas = (_cache!['reservas'] as List).where((r) => (r as Map)['estado'] == 'CONFIRMADA').length;
    return capacidad - (_cache!['enLote'] as List).length - reservadas;
  }

  Future<void> _guardarPendientes() async =>
      (await SharedPreferences.getInstance()).setString(_llavePendientes, jsonEncode(_pendientes));

  static String _normalizar(String placa) => placa.replaceAll('-', '').toUpperCase().trim();

  static String _uuid() {
    final r = Random.secure();
    final b = List<int>.generate(16, (_) => r.nextInt(256));
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    final h = b.map((x) => x.toRadixString(16).padLeft(2, '0')).join();
    return '${h.substring(0, 8)}-${h.substring(8, 12)}-${h.substring(12, 16)}-${h.substring(16, 20)}-${h.substring(20)}';
  }
}
