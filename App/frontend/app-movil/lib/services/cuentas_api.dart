import 'dart:async';
import 'dart:convert';
import 'dart:io' show SocketException;

import 'package:http/http.dart' as http;

import 'servidor.dart';
import 'sesion.dart';

/// Error devuelto por el Servicio de Administración.
///
/// Como en la reventa, el `mensaje` viene del servidor y se muestra tal cual:
/// la política de contraseñas, lo que se dice ante un login fallido y cuándo
/// se bloquea una cuenta son reglas del backend (RNF-14), no de la app.
class CuentasApiException implements Exception {
  CuentasApiException(this.codigo, this.mensaje, this.estadoHttp);

  final String codigo;
  final String mensaje;

  /// 0 si ni siquiera hubo respuesta.
  final int estadoHttp;

  bool get sinConexion => estadoHttp == 0;

  @override
  String toString() => mensaje;
}

/// Saca el token de lo que la persona pegue: el enlace completo del correo o
/// solo el token.
String? tokenDeEnlace(String texto) {
  final limpio = texto.trim();
  if (limpio.isEmpty) return null;
  final coincidencia = RegExp(r'token=([A-Za-z0-9_-]+)').firstMatch(limpio);
  if (coincidencia != null) return coincidencia.group(1);
  return RegExp(r'^[A-Za-z0-9_-]{20,200}$').hasMatch(limpio) ? limpio : null;
}

/// Cliente del Servicio de Administración — CU-027.
///
/// Registro (pasos 1-4), verificación (5-7), login (8-9), recuperación
/// (CU-027A), perfil (CU-027C) y cierre de sesión.
class CuentasApi {
  CuentasApi({http.Client? cliente, Sesion? sesionActual})
      : _cliente = cliente ?? http.Client(),
        _sesion = sesionActual ?? sesion {
    // La sesión renueva sus tokens a través de este cliente.
    _sesion.renovador = renovarSesion;
  }

  final http.Client _cliente;
  final Sesion _sesion;

  static const _espera = Duration(seconds: 15);
  static const _sinConexion =
      'No se pudo conectar con el servidor. Revisa tu conexión e intenta de nuevo.';

  Uri _uri(String ruta) =>
      Uri.parse('${Servidor.cuentas}/${Servidor.prefijo}/$ruta');

  // --- Sin sesión ----------------------------------------------------------

  /// Pasos 8-9. Si sale bien, la sesión queda abierta y guardada.
  ///
  /// Un correo que no existe, una contraseña mal y una cuenta bloqueada
  /// responden igual (401): el backend no lo distingue, a propósito.
  Future<UsuarioSesion> iniciarSesion(String email, String contrasena) async {
    final cuerpo = await _enviar('POST', 'sesiones',
            cuerpo: {'email': email.trim(), 'contrasena': contrasena})
        as Map<String, dynamic>;
    final usuario =
        UsuarioSesion.desdeJson(cuerpo['usuario'] as Map<String, dynamic>);
    await _sesion.abrir(
        tokens: TokensSesion.desdeJson(cuerpo), usuario: usuario);
    return usuario;
  }

  /// Pasos 1-4. Responde lo mismo exista o no el correo.
  Future<String> registrar({
    required String nombre,
    required String email,
    required String contrasena,
  }) async =>
      _mensaje(await _enviar('POST', 'cuentas/registro', cuerpo: {
        'nombre': nombre.trim(),
        'email': email.trim(),
        'contrasena': contrasena
      }));

  /// Pasos 6-7: activa la cuenta con el token del correo.
  Future<String> verificar(String token) async => _mensaje(
      await _enviar('POST', 'cuentas/verificar', cuerpo: {'token': token}));

  /// CU-027A: pide el enlace. Responde lo mismo exista o no la cuenta.
  Future<String> solicitarRecuperacion(String email) async =>
      _mensaje(await _enviar('POST', 'cuentas/recuperacion',
          cuerpo: {'email': email.trim()}));

  /// CU-027A: usa el enlace para poner una contraseña nueva.
  Future<String> restablecer(
          {required String token, required String contrasenaNueva}) async =>
      _mensaje(await _enviar('POST', 'cuentas/restablecer',
          cuerpo: {'token': token, 'contrasenaNueva': contrasenaNueva}));

  /// Renueva el token de acceso (DECISIONES.md §21 del backend). Lo usa
  /// [Sesion]; las pantallas no lo llaman.
  ///
  /// Sin respuesta del servidor lanza [RenovacionNoDisponible]: la sesión se
  /// conserva. Si el servidor dice que la sesión terminó, lanza
  /// [CuentasApiException] con su mensaje, y la sesión se cierra.
  Future<({TokensSesion tokens, List<String> roles})> renovarSesion(
      String tokenRenovacion) async {
    final dynamic cuerpo;
    try {
      cuerpo = await _enviar('POST', 'sesiones/renovar',
          cuerpo: {'tokenRenovacion': tokenRenovacion});
    } on CuentasApiException catch (error) {
      if (error.sinConexion ||
          error.estadoHttp >= 500 ||
          error.estadoHttp == 429) {
        throw RenovacionNoDisponible(error.mensaje);
      }
      rethrow;
    }
    final datos = cuerpo as Map<String, dynamic>;
    return (
      tokens: TokensSesion.desdeJson(datos),
      roles: (datos['roles'] as List<dynamic>).cast<String>(),
    );
  }

  // --- Con sesión ----------------------------------------------------------

  /// Comprueba contra el servidor que la sesión guardada sigue valiendo y
  /// trae los datos al día. Si no vale, la sesión se cierra (vía `_enviar`).
  Future<UsuarioSesion> comprobarSesion() async {
    final cuerpo = await _enviar('GET', 'sesiones/actual', conSesion: true)
        as Map<String, dynamic>;
    final usuario = UsuarioSesion.desdeJson(cuerpo);
    await _sesion.actualizarUsuario(usuario);
    return usuario;
  }

  /// Cierra la sesión **también en el servidor**, para que el token deje de
  /// valer en todo el sistema. Localmente se cierra pase lo que pase: si no hay
  /// red, la persona igual quiere salir.
  Future<void> cerrarSesion() async {
    try {
      if (_sesion.token != null) {
        await _enviar('DELETE', 'sesiones/actual', conSesion: true);
      }
    } on CuentasApiException {
      // Sin red o token ya inválido: no hay nada más que hacer en el servidor.
    } finally {
      await _sesion.cerrar();
    }
  }

  /// CU-027C: solo el nombre es editable (DECISIONES.md §14 del backend).
  Future<UsuarioSesion> editarNombre(String nombre) async {
    final cuerpo = await _enviar('PATCH', 'cuentas/perfil',
        cuerpo: {'nombre': nombre.trim()},
        conSesion: true) as Map<String, dynamic>;
    final actual = _sesion.usuario!;
    final nuevo = actual.conNombre(cuerpo['nombre'] as String);
    await _sesion.actualizarUsuario(nuevo);
    return nuevo;
  }

  /// CU-027C: pide la actual. Los fallos cuentan para el bloqueo de CU-027D;
  /// si se bloquea, el servidor cierra todas las sesiones y aquí también.
  Future<String> cambiarContrasena(
      {required String actual, required String nueva}) async {
    try {
      return _mensaje(await _enviar('PUT', 'cuentas/perfil/contrasena',
          cuerpo: {'contrasenaActual': actual, 'contrasenaNueva': nueva},
          conSesion: true));
    } on CuentasApiException catch (error) {
      if (error.codigo == 'CUENTA_BLOQUEADA') {
        await _sesion.caducada(error.mensaje);
      }
      rethrow;
    }
  }

  // --- Transporte ----------------------------------------------------------

  String _mensaje(dynamic cuerpo) =>
      (cuerpo as Map<String, dynamic>)['mensaje'] as String;

  Future<dynamic> _enviar(
    String metodo,
    String ruta, {
    Map<String, dynamic>? cuerpo,
    bool conSesion = false,
  }) async {
    final http.Response respuesta;
    if (conSesion) {
      try {
        // Renueva el token si hace falta y repite la petición ante un 401.
        respuesta = await _sesion.conAcceso<http.Response>(
          (token) => _transportar(metodo, ruta, cuerpo, token),
          estado: (r) => r.statusCode,
          sinSesion: () => throw CuentasApiException(
              'SIN_SESION', 'Inicia sesión para continuar.', 401),
        );
      } on RenovacionNoDisponible {
        throw CuentasApiException('SIN_CONEXION', _sinConexion, 0);
      }
    } else {
      respuesta = await _transportar(metodo, ruta, cuerpo, null);
    }

    final texto = utf8.decode(respuesta.bodyBytes);
    final dynamic datos = texto.isEmpty ? null : jsonDecode(texto);
    if (respuesta.statusCode >= 200 && respuesta.statusCode < 300) return datos;

    final error = _error(datos, respuesta.statusCode);
    // Con sesión, un 401 significa que el token ya no vale. En el login no: ahí
    // es "credenciales incorrectas" y no hay sesión que cerrar.
    if (conSesion && respuesta.statusCode == 401) {
      await _sesion.caducada(error.mensaje);
    }
    throw error;
  }

  Future<http.Response> _transportar(String metodo, String ruta,
      Map<String, dynamic>? cuerpo, String? token) async {
    final peticion = http.Request(metodo, _uri(ruta))
      ..headers['Content-Type'] = 'application/json';
    if (token != null) peticion.headers['Authorization'] = 'Bearer $token';
    if (cuerpo != null) peticion.body = jsonEncode(cuerpo);
    try {
      return await http.Response.fromStream(
          await _cliente.send(peticion).timeout(_espera));
    } on TimeoutException {
      throw CuentasApiException('SIN_CONEXION', _sinConexion, 0);
    } on SocketException {
      throw CuentasApiException('SIN_CONEXION', _sinConexion, 0);
    } on http.ClientException {
      throw CuentasApiException('SIN_CONEXION', _sinConexion, 0);
    }
  }

  CuentasApiException _error(dynamic datos, int estado) {
    if (datos is Map<String, dynamic>) {
      final codigo = datos['codigo'] as String?;
      if (codigo != null) {
        return CuentasApiException(
            codigo, datos['mensaje'] as String? ?? codigo, estado);
      }
      // Errores de validación de NestJS: {message: [...], statusCode}.
      final mensaje = datos['message'];
      if (mensaje != null) {
        return CuentasApiException('VALIDACION',
            mensaje is List ? mensaje.join('\n') : mensaje.toString(), estado);
      }
    }
    if (estado == 429 || estado == 503) {
      return CuentasApiException(
          'NO_DISPONIBLE',
          'El servicio está muy ocupado en este momento. Intenta de nuevo en unos segundos.',
          estado);
    }
    return CuentasApiException(
        'ERROR_$estado', 'El servidor respondió $estado.', estado);
  }
}

/// Instancia de la app. No es `final` para que las pruebas de pantallas puedan
/// sustituirla por una que hable con un servidor simulado.
CuentasApi cuentasApi = CuentasApi();
