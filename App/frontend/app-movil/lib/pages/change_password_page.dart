import 'package:flutter/material.dart';

import '../services/cuentas_api.dart';
import '../widgets/liquid_glass.dart';

/// Cambio de contraseña desde la sesión — CU-027C.
///
/// Pide la actual aunque ya haya sesión. Los fallos cuentan para el bloqueo de
/// CU-027D; si se bloquea, el servidor cierra todas las sesiones y la app
/// vuelve al login. Si sale bien, se cierran las sesiones de los demás
/// dispositivos y esta sigue abierta.
class ChangePasswordPage extends StatefulWidget {
  const ChangePasswordPage({super.key});

  @override
  State<ChangePasswordPage> createState() => _ChangePasswordPageState();
}

class _ChangePasswordPageState extends State<ChangePasswordPage> {
  final _current = TextEditingController();
  final _newPassword = TextEditingController();
  final _confirm = TextEditingController();
  bool _obscureCurrent = true;
  bool _obscureNew = true;
  bool _obscureConfirm = true;
  String? _error;

  @override
  void dispose() {
    _current.dispose();
    _newPassword.dispose();
    _confirm.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    if (_current.text.isEmpty) {
      setState(() => _error = 'Ingresa tu contraseña actual.');
      return;
    }
    // La política la aplica el servidor (RNF-14): aquí solo lo que no depende
    // de ninguna regla.
    if (_newPassword.text.isEmpty) {
      setState(() => _error = 'Escribe tu contraseña nueva.');
      return;
    }
    if (_newPassword.text != _confirm.text) {
      setState(() => _error = 'Las contraseñas no coinciden.');
      return;
    }
    setState(() => _error = null);
    final mensajero = ScaffoldMessenger.of(context);
    final navegador = Navigator.of(context);
    try {
      final mensaje = await cuentasApi.cambiarContrasena(
          actual: _current.text, nueva: _newPassword.text);
      mensajero.showSnackBar(SnackBar(content: Text(mensaje)));
      navegador.pop();
    } on CuentasApiException catch (error) {
      // Si la cuenta se bloqueó, la sesión ya se cerró y la app vuelve sola al
      // login; el mensaje lo muestra ella.
      if (mounted && error.codigo != 'CUENTA_BLOQUEADA') {
        setState(() => _error = error.mensaje);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    return GlassScaffold(
      appBar: const GlassAppBar(title: Text('Cambiar contraseña')),
      body: ListView(
        padding: EdgeInsets.fromLTRB(20,
            kToolbarHeight + MediaQuery.of(context).padding.top + 24, 20, 24),
        children: [
          Text('Actualiza tu contraseña', style: textTheme.titleLarge),
          const SizedBox(height: 6),
          Text(
            'Ingresa tu contraseña actual y elige una nueva.',
            style: textTheme.bodyMedium,
          ),
          const SizedBox(height: 24),
          TextField(
            controller: _current,
            obscureText: _obscureCurrent,
            decoration: InputDecoration(
              labelText: 'Contraseña actual',
              suffixIcon: IconButton(
                icon: Icon(_obscureCurrent
                    ? Icons.visibility_outlined
                    : Icons.visibility_off_outlined),
                onPressed: () =>
                    setState(() => _obscureCurrent = !_obscureCurrent),
              ),
            ),
          ),
          const SizedBox(height: 14),
          TextField(
            controller: _newPassword,
            obscureText: _obscureNew,
            onChanged: (_) => setState(() {}),
            decoration: InputDecoration(
              labelText: 'Nueva contraseña',
              suffixIcon: IconButton(
                icon: Icon(_obscureNew
                    ? Icons.visibility_outlined
                    : Icons.visibility_off_outlined),
                onPressed: () => setState(() => _obscureNew = !_obscureNew),
              ),
            ),
          ),
          const SizedBox(height: 8),
          PasswordStrengthMeter(password: _newPassword.text),
          const SizedBox(height: 14),
          TextField(
            controller: _confirm,
            obscureText: _obscureConfirm,
            decoration: InputDecoration(
              labelText: 'Confirmar nueva contraseña',
              suffixIcon: IconButton(
                icon: Icon(_obscureConfirm
                    ? Icons.visibility_outlined
                    : Icons.visibility_off_outlined),
                onPressed: () =>
                    setState(() => _obscureConfirm = !_obscureConfirm),
              ),
            ),
          ),
          if (_error != null) ...[
            const SizedBox(height: 10),
            Text(_error!,
                style: TextStyle(color: Theme.of(context).colorScheme.error)),
          ],
          const SizedBox(height: 22),
          LoadingFilledButton(label: 'Guardar cambios', onPressed: _save),
        ],
      ),
    );
  }
}
