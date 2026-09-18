import 'package:flutter/material.dart';

import '../services/cuentas_api.dart';
import '../widgets/liquid_glass.dart';
import 'formulario_cuenta.dart';
import 'verificar_cuenta_page.dart';

/// Registro — CU-027 pasos 1-4: nombre, correo y contraseña.
///
/// La cuenta se crea siempre con rol **Cliente** (paso 4). Las cuentas de
/// Personal no se crean desde aquí: las da de alta un administrador (CU-028).
/// Dejar que cualquiera se registre como Personal le daría acceso a validar
/// entradas en el recinto.
///
/// La política de contraseñas la aplica el servidor y su mensaje se muestra
/// tal cual: repetirla aquí sería una regla de negocio duplicada (RNF-14) que
/// tarde o temprano diría otra cosa que el backend.
class RegisterPage extends StatefulWidget {
  const RegisterPage({super.key});

  @override
  State<RegisterPage> createState() => _RegisterPageState();
}

class _RegisterPageState extends State<RegisterPage> {
  final _nombre = TextEditingController();
  final _email = TextEditingController();
  final _contrasena = TextEditingController();
  final _confirmacion = TextEditingController();
  bool _aceptaTerminos = false;
  String? _error;

  @override
  void dispose() {
    _nombre.dispose();
    _email.dispose();
    _contrasena.dispose();
    _confirmacion.dispose();
    super.dispose();
  }

  Future<void> _crear() async {
    // Solo lo que no depende de ninguna regla del servidor.
    if (_nombre.text.trim().isEmpty ||
        _email.text.trim().isEmpty ||
        _contrasena.text.isEmpty) {
      setState(() => _error = 'Completa tu nombre, correo y contraseña.');
      return;
    }
    if (_contrasena.text != _confirmacion.text) {
      setState(() => _error = 'Las contraseñas no coinciden.');
      return;
    }
    final email = _email.text.trim();
    final navegador = Navigator.of(context);
    try {
      final mensaje = await cuentasApi.registrar(
          nombre: _nombre.text, email: email, contrasena: _contrasena.text);
      navegador.pushReplacement(MaterialPageRoute(
          builder: (_) => VerificarCuentaPage(email: email, mensaje: mensaje)));
    } on CuentasApiException catch (error) {
      if (mounted) setState(() => _error = error.mensaje);
    }
  }

  @override
  Widget build(BuildContext context) {
    final textos = Theme.of(context).textTheme;
    return TarjetaFormulario(
      titulo: 'Crear cuenta',
      icono: Icons.person_add_alt_1_outlined,
      encabezado: 'Únete a HEXACORE',
      explicacion:
          'Compra entradas, reserva parqueadero y pide comida en un solo lugar.',
      hijos: [
        TextField(
          key: const Key('campo-nombre'),
          controller: _nombre,
          textCapitalization: TextCapitalization.words,
          decoration: const InputDecoration(labelText: 'Nombre completo'),
        ),
        const SizedBox(height: 14),
        TextField(
          key: const Key('campo-correo'),
          controller: _email,
          keyboardType: TextInputType.emailAddress,
          autocorrect: false,
          decoration: const InputDecoration(labelText: 'Correo'),
        ),
        const SizedBox(height: 14),
        CampoContrasena(
          key: const Key('campo-contrasena'),
          controlador: _contrasena,
          etiqueta: 'Contraseña',
          alCambiar: (_) => setState(() {}),
        ),
        PasswordStrengthMeter(password: _contrasena.text),
        const SizedBox(height: 14),
        CampoContrasena(
          key: const Key('campo-confirmacion'),
          controlador: _confirmacion,
          etiqueta: 'Confirmar contraseña',
          alEnviar: (_) => _crear(),
        ),
        const SizedBox(height: 8),
        InkWell(
          key: const Key('aceptar-terminos'),
          onTap: () => setState(() => _aceptaTerminos = !_aceptaTerminos),
          borderRadius: BorderRadius.circular(10),
          child: Row(children: [
            Checkbox(
              value: _aceptaTerminos,
              onChanged: (valor) =>
                  setState(() => _aceptaTerminos = valor ?? false),
            ),
            Expanded(
              child: Text('Acepto los términos y la política de privacidad',
                  style: textos.bodySmall),
            ),
          ]),
        ),
        TextoError(_error),
        const SizedBox(height: 12),
        LoadingFilledButton(
          key: const Key('boton-crear-cuenta'),
          label: 'Crear cuenta',
          onPressed: _aceptaTerminos ? _crear : null,
        ),
        const SizedBox(height: 14),
        Center(
          child: TextButton(
            onPressed: () => Navigator.of(context).pop(),
            child: const Text('¿Ya tienes cuenta? Inicia sesión'),
          ),
        ),
      ],
    );
  }
}
