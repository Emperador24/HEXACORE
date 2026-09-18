import 'dart:convert';

import 'package:flutter/foundation.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Quién tiene la sesión abierta, tal como lo devuelve el backend.
class UsuarioSesion {
  const UsuarioSesion({
    required this.id,
    required this.nombre,
    required this.email,
    required this.roles,
  });

  factory UsuarioSesion.desdeJson(Map<String, dynamic> json) => UsuarioSesion(
        id: json['id'] as String,
        nombre: json['nombre'] as String,
        email: json['email'] as String,
        roles: (json['roles'] as List<dynamic>).cast<String>(),
      );

  final String id;
  final String nombre;
  final String email;

  /// Roles del CU-028: `Cliente`, `Personal`, `Organizador`, `Administrador`.
  final List<String> roles;

  Map<String, dynamic> aJson() =>
      {'id': id, 'nombre': nombre, 'email': email, 'roles': roles};

  UsuarioSesion conNombre(String nuevo) =>
      UsuarioSesion(id: id, nombre: nuevo, email: email, roles: roles);
}

/// Dónde se guarda la sesión entre aperturas de la app.
///
/// Es una interfaz para que las pruebas puedan usar memoria: el almacén real
/// habla con el sistema operativo y no existe fuera de un dispositivo.
abstract class AlmacenSesion {
  Future<String?> leer(String clave);
  Future<void> escribir(String clave, String valor);
  Future<void> borrar(String clave);
}

/// Llavero de iOS / Keystore de Android.
///
/// **No `shared_preferences`**: ahí el token quedaría en texto plano, legible
/// en una copia de seguridad del teléfono. Y el token es una credencial: quien
/// lo tenga *es* esa persona hasta que caduque o se cierre la sesión.
class AlmacenSeguro implements AlmacenSesion {
  const AlmacenSeguro();

  static const _almacen = FlutterSecureStorage(
    // Solo legible con el teléfono desbloqueado, y sin copiarse a otro
    // dispositivo al restaurar una copia de seguridad.
    iOptions: IOSOptions(
        accessibility: KeychainAccessibility.first_unlock_this_device),
  );

  @override
  Future<String?> leer(String clave) => _almacen.read(key: clave);
  @override
  Future<void> escribir(String clave, String valor) =>
      _almacen.write(key: clave, value: valor);
  @override
  Future<void> borrar(String clave) => _almacen.delete(key: clave);
}

class AlmacenMemoria implements AlmacenSesion {
  final Map<String, String> datos = {};
  @override
  Future<String?> leer(String clave) async => datos[clave];
  @override
  Future<void> escribir(String clave, String valor) async =>
      datos[clave] = valor;
  @override
  Future<void> borrar(String clave) async => datos.remove(clave);
}

/// La sesión de la app (CU-027 paso 9): el token y de quién es.
///
/// Es la **única** fuente de identidad de la app. Los clientes de la API leen
/// el token de aquí, y cuando el servidor dice que ya no vale (401), avisan
/// aquí para que la app vuelva a la pantalla de login.
/// Lo que devuelve el servidor al iniciar sesión o al renovar.
class TokensSesion {
  const TokensSesion({
    required this.acceso,
    required this.accesoExpiraEn,
    required this.renovacion,
    required this.renovacionExpiraEn,
  });

  factory TokensSesion.desdeJson(Map<String, dynamic> json) => TokensSesion(
        acceso: json['token'] as String,
        accesoExpiraEn: DateTime.parse(json['expiraEn'] as String),
        renovacion: json['tokenRenovacion'] as String,
        renovacionExpiraEn: DateTime.parse(json['renovacionExpiraEn'] as String),
      );

  final String acceso;
  final DateTime accesoExpiraEn;
  final String renovacion;
  final DateTime renovacionExpiraEn;
}

/// Error al renovar que **no** significa que la sesión terminó (sin red, el
/// servidor no responde). La sesión se conserva y la petición falla.
class RenovacionNoDisponible implements Exception {
  const RenovacionNoDisponible(this.mensaje);
  final String mensaje;
  @override
  String toString() => mensaje;
}

/// La sesión de la app (CU-027 paso 9): los tokens y de quién son.
///
/// Es la **única** fuente de identidad de la app. Los clientes de la API piden
/// aquí el token con [conAcceso], que se encarga de renovarlo.
///
/// ## Dos tokens (DECISIONES.md §21 del servicio de Administración)
///
/// - **Acceso**: dura 15 minutos y va en cada petición.
/// - **Renovación**: dura 30 días desde el último uso y solo se envía al
///   renovar. Cada renovación devuelve uno nuevo y el anterior deja de valer.
///
/// ## Una sola renovación a la vez
///
/// Al abrir una pantalla salen varias peticiones juntas. Si todas encontraran
/// el token caducado y cada una renovara por su cuenta, la segunda usaría un
/// token de renovación que la primera ya gastó, y el servidor lo tomaría por un
/// robo y cerraría la sesión. Por eso [renovar] comparte una sola renovación
/// en curso entre todas las que la pidan.
class Sesion extends ChangeNotifier {
  Sesion({AlmacenSesion almacen = const AlmacenSeguro()}) : _almacen = almacen;

  static const _claveToken = 'hexacore.sesion.token';
  static const _claveUsuario = 'hexacore.sesion.usuario';
  static const _claveExpira = 'hexacore.sesion.expira';
  static const _claveRenovacion = 'hexacore.sesion.renovacion';
  static const _claveRenovacionExpira = 'hexacore.sesion.renovacion.expira';

  /// Se renueva un poco antes de que el acceso caduque, para que una petición
  /// no salga con un token que vence por el camino.
  static const margenRenovacion = Duration(seconds: 60);

  AlmacenSesion _almacen;
  String? _token;
  UsuarioSesion? _usuario;
  DateTime? _expiraEn;
  String? _tokenRenovacion;
  DateTime? _renovacionExpiraEn;
  Future<void>? _renovacionEnCurso;

  /// Hace la llamada de renovación. Lo registra `CuentasApi`, que es quien
  /// habla con el servidor; así este archivo no depende de él.
  ///
  /// Debe devolver los tokens nuevos y los roles actuales, lanzar
  /// [RenovacionNoDisponible] si no hubo respuesta, o lanzar cualquier otra
  /// cosa (con un mensaje) si el servidor dijo que la sesión terminó.
  Future<({TokensSesion tokens, List<String> roles})> Function(String tokenRenovacion)? renovador;

  /// Por qué se cerró la sesión la última vez sin que la persona lo pidiera.
  /// La app lo muestra una vez y lo limpia.
  String? motivoCierre;

  /// Para las pruebas.
  @visibleForTesting
  set almacen(AlmacenSesion valor) => _almacen = valor;

  /// Para las pruebas: simula que el token de acceso ya caducó.
  @visibleForTesting
  void caducarAccesoParaPruebas() => _expiraEn = DateTime.now().subtract(const Duration(seconds: 1));

  String? get token => _token;
  UsuarioSesion? get usuario => _usuario;
  DateTime? get expiraEn => _expiraEn;
  String? get tokenRenovacion => _tokenRenovacion;

  bool _accesoVigente(Duration margen) =>
      _expiraEn?.isAfter(DateTime.now().add(margen)) ?? false;

  bool get _renovable =>
      _tokenRenovacion != null && (_renovacionExpiraEn?.isAfter(DateTime.now()) ?? false);

  /// Hay sesión: el acceso sigue vigente o se puede renovar. El servidor tiene
  /// la última palabra: puede haberla cerrado antes.
  bool get abierta =>
      _token != null && _usuario != null && (_accesoVigente(Duration.zero) || _renovable);

  Future<void> abrir({required TokensSesion tokens, required UsuarioSesion usuario}) async {
    _usuario = usuario;
    motivoCierre = null;
    await _guardarTokens(tokens);
    await _almacen.escribir(_claveUsuario, jsonEncode(usuario.aJson()));
    notifyListeners();
  }

  /// Recupera la sesión guardada. Una que ya no se puede renovar se descarta.
  Future<void> restaurar() async {
    try {
      final token = await _almacen.leer(_claveToken);
      final expira = await _almacen.leer(_claveExpira);
      final usuario = await _almacen.leer(_claveUsuario);
      if (token == null || expira == null || usuario == null) return;

      _token = token;
      _expiraEn = DateTime.parse(expira);
      _usuario = UsuarioSesion.desdeJson(jsonDecode(usuario) as Map<String, dynamic>);
      _tokenRenovacion = await _almacen.leer(_claveRenovacion);
      final renovacionExpira = await _almacen.leer(_claveRenovacionExpira);
      _renovacionExpiraEn = renovacionExpira == null ? null : DateTime.parse(renovacionExpira);
      if (!abierta) await _limpiar();
    } catch (_) {
      // Datos corruptos o de una versión anterior: se empieza de cero.
      _token = null;
      _usuario = null;
      _expiraEn = null;
      _tokenRenovacion = null;
      _renovacionExpiraEn = null;
      try {
        await _limpiar();
      } catch (_) {
        // Si ni siquiera se puede borrar, al menos en memoria no hay sesión.
      }
    }
  }

  /// Ejecuta una petición con un token de acceso vigente.
  ///
  /// 1. Si el acceso caduca en menos de [margenRenovacion], renueva antes.
  /// 2. Si aun así el servidor responde 401, renueva (salvo que otra petición
  ///    ya lo haya hecho mientras tanto) y **repite la petición una vez**.
  ///
  /// Repetir es seguro: un 401 significa que el servidor la rechazó antes de
  /// hacer nada.
  Future<R> conAcceso<R>(
    Future<R> Function(String token) enviar, {
    required int Function(R respuesta) estado,
    required Never Function() sinSesion,
  }) async {
    if (!_accesoVigente(margenRenovacion)) await renovar();
    final token = _token ?? sinSesion();

    final respuesta = await enviar(token);
    if (estado(respuesta) != 401 || !_renovable) return respuesta;

    await renovar(tokenRechazado: token);
    final nuevo = _token;
    if (nuevo == null || nuevo == token) return respuesta;
    return enviar(nuevo);
  }

  /// Renueva el token de acceso. Si ya hay una renovación en curso, espera a
  /// esa en vez de lanzar otra.
  ///
  /// Con [tokenRechazado]: solo renueva si ese sigue siendo el token actual. Si
  /// ya cambió, es que otra petición renovó mientras tanto y no hace falta.
  Future<void> renovar({String? tokenRechazado}) {
    if (tokenRechazado != null && tokenRechazado != _token) return Future.value();
    return _renovacionEnCurso ??= _renovar().whenComplete(() => _renovacionEnCurso = null);
  }

  Future<void> _renovar() async {
    final tokenRenovacion = _tokenRenovacion;
    final renovar = renovador;
    if (_token == null) return;
    if (tokenRenovacion == null || !_renovable || renovar == null) {
      await caducada();
      return;
    }
    try {
      final resultado = await renovar(tokenRenovacion);
      // La sesión pudo cerrarse mientras tanto (la persona pulsó "salir").
      if (_token == null) return;
      await _guardarTokens(resultado.tokens);
      final usuario = _usuario!;
      if (!listEquals(usuario.roles, resultado.roles)) {
        await actualizarUsuario(UsuarioSesion(
            id: usuario.id, nombre: usuario.nombre, email: usuario.email, roles: resultado.roles));
      }
    } on RenovacionNoDisponible {
      // Sin red: la sesión sigue. La petición fallará por falta de conexión.
      rethrow;
    } catch (error) {
      await caducada(error.toString());
    }
  }

  Future<void> actualizarUsuario(UsuarioSesion usuario) async {
    _usuario = usuario;
    await _almacen.escribir(_claveUsuario, jsonEncode(usuario.aJson()));
    notifyListeners();
  }

  /// La persona cerró sesión.
  Future<void> cerrar() async {
    await _limpiar();
    notifyListeners();
  }

  /// El servidor dijo que la sesión ya no vale: se cerró desde otro
  /// dispositivo, cambió la contraseña, la cuenta se desactivó o bloqueó, o no
  /// se pudo renovar.
  Future<void> caducada([String motivo = 'Tu sesión terminó. Inicia sesión de nuevo.']) async {
    if (_token == null) return;
    motivoCierre = motivo;
    await _limpiar();
    notifyListeners();
  }

  Future<void> _guardarTokens(TokensSesion tokens) async {
    _token = tokens.acceso;
    _expiraEn = tokens.accesoExpiraEn;
    _tokenRenovacion = tokens.renovacion;
    _renovacionExpiraEn = tokens.renovacionExpiraEn;
    await _almacen.escribir(_claveToken, tokens.acceso);
    await _almacen.escribir(_claveExpira, tokens.accesoExpiraEn.toIso8601String());
    await _almacen.escribir(_claveRenovacion, tokens.renovacion);
    await _almacen.escribir(_claveRenovacionExpira, tokens.renovacionExpiraEn.toIso8601String());
  }

  Future<void> _limpiar() async {
    _token = null;
    _usuario = null;
    _expiraEn = null;
    _tokenRenovacion = null;
    _renovacionExpiraEn = null;
    for (final clave in [_claveToken, _claveExpira, _claveUsuario, _claveRenovacion, _claveRenovacionExpira]) {
      await _almacen.borrar(clave);
    }
  }
}

final sesion = Sesion();
