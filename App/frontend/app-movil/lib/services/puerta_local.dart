// CU-002E: la puerta del evento sigue validando si se cae la red.
//
// Con conexión, el dispositivo descarga de Acceso QR la lista de entradas que
// hoy pueden ingresar, como **hashes** SHA-256 (los códigos no viajan). Sin
// conexión, valida el QR contra esa lista, deja el ingreso en cola con la hora
// real del escaneo y, al volver la red, lo sube a `POST /ingresos/sincronizacion`.
// El servidor vuelve a aplicar todas las reglas: lo que no pase (por ejemplo,
// el mismo QR escaneado en dos puertas desconectadas) vuelve como conflicto
// para que el personal lo revise.
import 'dart:convert';

import 'package:crypto/crypto.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Lo que se decidió sin red.
class DecisionPuerta {
  DecisionPuerta(this.autorizado, this.mensaje, {this.numeroTicket, this.localidadNombre});
  final bool autorizado;
  final String mensaje;
  final String? numeroTicket;
  final String? localidadNombre;
}

class PuertaLocal {
  PuertaLocal(this.eventoId);
  final String eventoId;

  Map<String, dynamic>? _cache;
  List<Map<String, dynamic>> _pendientes = [];

  String get _llaveCache => 'puerta.cache.$eventoId';
  String get _llavePendientes => 'puerta.pendientes.$eventoId';

  bool get tieneCache => _cache != null;
  List<Map<String, dynamic>> get pendientes => List.unmodifiable(_pendientes);
  int get validos => (_cache?['validos'] as List?)?.length ?? 0;
  DateTime? get cacheGeneradaEn =>
      _cache == null ? null : DateTime.tryParse(_cache!['generadaEn'] as String? ?? '')?.toLocal();

  /// El mismo hash que guarda el servidor: SHA-256 del código **tal cual**
  /// (los códigos llevan base64url y distinguen mayúsculas).
  static String hashQr(String codigo) => sha256.convert(utf8.encode(codigo.trim())).toString();

  Future<void> cargar() async {
    final prefs = await SharedPreferences.getInstance();
    final cache = prefs.getString(_llaveCache);
    _cache = cache == null ? null : jsonDecode(cache) as Map<String, dynamic>;
    _pendientes = (jsonDecode(prefs.getString(_llavePendientes) ?? '[]') as List).cast<Map<String, dynamic>>();
  }

  /// Guarda la lista que entregó el servidor. Lo que se dejó pasar sin red y
  /// aún no se sincronizó sigue fuera de la lista nueva.
  Future<void> guardarCache(Map<String, dynamic> cache) async {
    _cache = cache;
    for (final p in _pendientes) {
      _quitar(hashQr(p['codigoQr'] as String));
    }
    await _guardarCache();
  }

  /// Sin red: valida contra la lista descargada y, si pasa, deja el ingreso en cola.
  /// Devuelve `null` si no hay lista: entonces no se puede decidir nada.
  Future<DecisionPuerta?> ingreso(String codigo) async {
    if (_cache == null) return null;
    final limpio = codigo.trim();
    final hash = hashQr(limpio);
    // CU-002D sin red: ya entró por esta puerta mientras no había conexión.
    final previo = _pendientes.where((p) => hashQr(p['codigoQr'] as String) == hash).firstOrNull;
    if (previo != null) {
      return DecisionPuerta(false, 'Esta entrada ya ingresó (registrada sin conexión).');
    }
    final entrada = (_cache!['validos'] as List).cast<Map<String, dynamic>>().where((v) => v['hash'] == hash).firstOrNull;
    // CU-002A sin red: no está entre las entradas válidas descargadas (inválida,
    // de otro evento, anulada o ya usada antes de perder la red).
    if (entrada == null) {
      return DecisionPuerta(false, 'El código no está entre las entradas válidas descargadas.');
    }
    _pendientes = [
      ..._pendientes,
      {'codigoQr': limpio, 'escaneadoEn': DateTime.now().toUtc().toIso8601String()},
    ];
    _quitar(hash);
    await Future.wait([_guardarPendientes(), _guardarCache()]);
    return DecisionPuerta(
      true,
      'Ingreso autorizado sin conexión; se sincroniza al volver la red.',
      numeroTicket: entrada['numeroTicket'] as String?,
      localidadNombre: entrada['localidadNombre'] as String?,
    );
  }

  /// Con red, el servidor ya decidió (autorizó, o la dio por usada o anulada):
  /// ese QR deja de valer también para la lista local.
  Future<void> marcarNoValido(String codigo) async {
    if (_cache == null) return;
    _quitar(hashQr(codigo));
    await _guardarCache();
  }

  /// Quita de la cola lo que el servidor procesó y devuelve los conflictos.
  Future<List<Map<String, dynamic>>> confirmarSincronizacion(Map<String, dynamic> respuesta) async {
    final resultados = (respuesta['resultados'] as List).cast<Map<String, dynamic>>();
    final procesados = resultados.map((r) => r['codigoQr']).toSet();
    _pendientes = _pendientes.where((p) => !procesados.contains(p['codigoQr'])).toList();
    await _guardarPendientes();
    return resultados.where((r) => r['resultado'] != 'REGISTRADO').toList();
  }

  void _quitar(String hash) {
    final cache = _cache;
    if (cache == null) return;
    cache['validos'] = (cache['validos'] as List).where((v) => (v as Map)['hash'] != hash).toList();
  }

  Future<void> _guardarCache() async =>
      (await SharedPreferences.getInstance()).setString(_llaveCache, jsonEncode(_cache));

  Future<void> _guardarPendientes() async =>
      (await SharedPreferences.getInstance()).setString(_llavePendientes, jsonEncode(_pendientes));
}
