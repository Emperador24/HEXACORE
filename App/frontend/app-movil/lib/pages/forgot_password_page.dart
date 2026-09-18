import 'package:flutter/material.dart';

import '../services/cuentas_api.dart';
import '../widgets/liquid_glass.dart';
import 'formulario_cuenta.dart';

/// Recuperación de contraseña — CU-027A: *"el sistema envía un enlace de
/// recuperación de un solo uso con expiración"*.
///
/// Es un enlace y no un código de seis dígitos: un código tan corto se
/// adivina probando, un enlace de 256 bits no.
class ForgotPasswordPage extends StatefulWidget {
  const ForgotPasswordPage({super.key, this.email});
  final String? email;

  @override
  State<ForgotPasswordPage> createState() => _ForgotPasswordPageState();
}

class _ForgotPasswordPageState extends State<ForgotPasswordPage> {
  late final _email = TextEditingController(text: widget.email);
  String? _error;

  @override
  void dispose() {
    _email.dispose();
    super.dispose();
  }

  Future<void> _enviar() async {
    final email = _email.text.trim();
    if (email.isEmpty) {
      setState(() => _error = 'Ingresa tu correo.');
      return;
    }
    final navegador = Navigator.of(context);
    try {
      // Responde lo mismo exista o no la cuenta: la pantalla siguiente no
      // puede decir "te enviamos el enlace" como si fuera seguro.
      final mensaje = await cuentasApi.solicitarRecuperacion(email);
      navegador.pushReplacement(MaterialPageRoute(
          builder: (_) => _RestablecerPage(email: email, mensaje: mensaje)));
    } on CuentasApiException catch (error) {
      if (mounted) setState(() => _error = error.mensaje);
    }
  }

  @override
  Widget build(BuildContext context) => TarjetaFormulario(
        titulo: 'Recuperar contraseña',
        icono: Icons.lock_reset_outlined,
        encabezado: '¿Olvidaste tu contraseña?',
        explicacion:
            'Ingresa tu correo y te enviaremos un enlace para elegir una nueva.',
        hijos: [
          TextField(
            key: const Key('campo-correo-recuperacion'),
            controller: _email,
            keyboardType: TextInputType.emailAddress,
            autocorrect: false,
            onSubmitted: (_) => _enviar(),
            decoration: const InputDecoration(labelText: 'Correo'),
          ),
          TextoError(_error),
          const SizedBox(height: 20),
          LoadingFilledButton(label: 'Enviar enlace', onPressed: _enviar),
        ],
      );
}

class _RestablecerPage extends StatefulWidget {
  const _RestablecerPage({required this.email, required this.mensaje});
  final String email;
  final String mensaje;

  @override
  State<_RestablecerPage> createState() => _RestablecerPageState();
}

class _RestablecerPageState extends State<_RestablecerPage> {
  final _enlace = TextEditingController();
  final _nueva = TextEditingController();
  final _confirmacion = TextEditingController();
  String? _error;

  @override
  void dispose() {
    _enlace.dispose();
    _nueva.dispose();
    _confirmacion.dispose();
    super.dispose();
  }

  Future<void> _restablecer() async {
    final token = tokenDeEnlace(_enlace.text);
    if (token == null) {
      setState(
          () => _error = 'Pega el enlace completo que te llegó por correo.');
      return;
    }
    if (_nueva.text.isEmpty) {
      setState(() => _error = 'Escribe tu contraseña nueva.');
      return;
    }
    if (_nueva.text != _confirmacion.text) {
      setState(() => _error = 'Las contraseñas no coinciden.');
      return;
    }
    final mensajero = ScaffoldMessenger.of(context);
    final navegador = Navigator.of(context);
    try {
      final mensaje = await cuentasApi.restablecer(
          token: token, contrasenaNueva: _nueva.text);
      navegador.popUntil((ruta) => ruta.isFirst);
      avisar(mensajero, mensaje);
    } on CuentasApiException catch (error) {
      if (mounted) setState(() => _error = error.mensaje);
    }
  }

  @override
  Widget build(BuildContext context) => TarjetaFormulario(
        titulo: 'Nueva contraseña',
        icono: Icons.mark_email_read_outlined,
        encabezado: 'Revisa ${widget.email}',
        explicacion:
            '${widget.mensaje} El enlace caduca pronto y solo sirve una vez.',
        hijos: [
          TextField(
            key: const Key('campo-enlace-recuperacion'),
            controller: _enlace,
            autocorrect: false,
            minLines: 1,
            maxLines: 3,
            decoration: const InputDecoration(labelText: 'Enlace del correo'),
          ),
          const SizedBox(height: 14),
          CampoContrasena(
            controlador: _nueva,
            etiqueta: 'Contraseña nueva',
            alCambiar: (_) => setState(() {}),
          ),
          PasswordStrengthMeter(password: _nueva.text),
          const SizedBox(height: 14),
          CampoContrasena(
            controlador: _confirmacion,
            etiqueta: 'Confirmar contraseña',
            alEnviar: (_) => _restablecer(),
          ),
          TextoError(_error),
          const SizedBox(height: 20),
          LoadingFilledButton(
              label: 'Guardar contraseña', onPressed: _restablecer),
          const AyudaBuzonDesarrollo(),
        ],
      );
}
