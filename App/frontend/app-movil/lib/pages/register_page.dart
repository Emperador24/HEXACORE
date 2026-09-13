import 'package:flutter/material.dart';

import '../main.dart' show User;
import '../services/api_client.dart';
import '../widgets/liquid_glass.dart';
import 'otp_page.dart';

// registro por redes sociales (simulado) o correo/teléfono con OTP
class RegisterPage extends StatefulWidget {
  const RegisterPage({super.key, required this.onRegistered});
  final ValueChanged<User> onRegistered;

  @override
  State<RegisterPage> createState() => _RegisterPageState();
}

final _emailRegex = RegExp(r'^[\w.+-]+@[\w-]+\.[a-zA-Z]{2,}$');

const _kStaffAreas = ['Entrada', 'Parqueadero', 'Restaurante'];

class _RegisterPageState extends State<RegisterPage> {
  bool _byPhone = false;
  bool _asStaff = false;
  String _area = _kStaffAreas.first;
  bool _acceptedTerms = false;
  bool _loadingProvider = false;
  String? _error;

  final _name = TextEditingController();
  final _email = TextEditingController();
  final _phone = TextEditingController();
  final _password = TextEditingController();
  final _confirm = TextEditingController();

  @override
  void dispose() {
    _name.dispose();
    _email.dispose();
    _phone.dispose();
    _password.dispose();
    _confirm.dispose();
    super.dispose();
  }

  Future<void> _continueWithProvider(String provider) async {
    setState(() => _loadingProvider = true);
    await Future.delayed(const Duration(milliseconds: 900));
    if (!mounted) return;
    final user = provider == 'Google'
        ? const User('Cuenta de Google', 'usuario.demo@gmail.com', 'Cliente')
        : const User('Cuenta de Apple', 'usuario.demo@icloud.com', 'Cliente');
    widget.onRegistered(user);
    Navigator.of(context).popUntil((route) => route.isFirst);
  }

  Future<void> _submit() async {
    final name = _name.text.trim();
    if (name.isEmpty) {
      setState(() => _error = 'Ingresa tu nombre completo.');
      return;
    }
    if (!_acceptedTerms) {
      setState(() =>
          _error = 'Debes aceptar los términos y la política de privacidad.');
      return;
    }
    if (_byPhone) {
      final phone = _phone.text.trim();
      if (!RegExp(r'^[0-9]{10}$').hasMatch(phone)) {
        setState(() =>
            _error = 'Ingresa un número de teléfono válido (10 dígitos).');
        return;
      }
      final destination = '+57 $phone';
      await apiClient.sendOtp(destination);
      if (!mounted) return;
      final pendingUser = User(
          name, destination, _asStaff ? 'Personal' : 'Cliente',
          position: _asStaff ? _area : null);
      _goToOtp(destination, pendingUser);
      return;
    }
    final email = _email.text.trim();
    if (!_emailRegex.hasMatch(email)) {
      setState(() => _error = 'Ingresa un correo válido.');
      return;
    }
    if (_password.text.length < 8 ||
        !RegExp(r'[A-Z]').hasMatch(_password.text) ||
        !RegExp(r'[0-9]').hasMatch(_password.text)) {
      setState(() => _error =
          'La contraseña debe tener al menos 8 caracteres, una mayúscula y un número.');
      return;
    }
    if (_password.text != _confirm.text) {
      setState(() => _error = 'Las contraseñas no coinciden.');
      return;
    }
    await apiClient.sendOtp(email);
    if (!mounted) return;
    final pendingUser = User(name, email, _asStaff ? 'Personal' : 'Cliente',
        position: _asStaff ? _area : null);
    _goToOtp(email, pendingUser);
  }

  void _goToOtp(String destination, User pendingUser) {
    setState(() => _error = null);
    Navigator.of(context).push(MaterialPageRoute(
      builder: (_) => OtpPage(
        destination: destination,
        pendingUser: pendingUser,
        onVerified: widget.onRegistered,
      ),
    ));
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final textTheme = Theme.of(context).textTheme;
    return GlassScaffold(
      appBar: const GlassAppBar(title: Text('Crear cuenta')),
      body: SafeArea(
        child: SingleChildScrollView(
          padding: EdgeInsets.fromLTRB(24,
              kToolbarHeight + MediaQuery.of(context).padding.top + 24, 24, 24),
          child: LiquidGlassCard(
            padding: const EdgeInsets.all(24),
            borderRadius: BorderRadius.circular(32),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text('Únete a HEXACORE',
                    textAlign: TextAlign.center,
                    style: textTheme.headlineSmall),
                const SizedBox(height: 4),
                Text(
                    'Compra entradas, reserva parqueadero y pide comida en un solo lugar.',
                    textAlign: TextAlign.center,
                    style: textTheme.bodyMedium?.copyWith(
                        color: scheme.onSurface.withValues(alpha: 0.6))),
                const SizedBox(height: 24),
                SegmentedButton<bool>(
                  segments: const [
                    ButtonSegment(
                        value: false,
                        label: Text('Cliente'),
                        icon: Icon(Icons.person_outline)),
                    ButtonSegment(
                        value: true,
                        label: Text('Personal'),
                        icon: Icon(Icons.badge_outlined)),
                  ],
                  selected: {_asStaff},
                  onSelectionChanged: (value) =>
                      setState(() => _asStaff = value.first),
                ),
                if (_asStaff) ...[
                  const SizedBox(height: 14),
                  DropdownButtonFormField<String>(
                    initialValue: _area,
                    decoration:
                        const InputDecoration(labelText: 'Área operativa'),
                    items: [
                      for (final area in _kStaffAreas)
                        DropdownMenuItem(value: area, child: Text(area)),
                    ],
                    onChanged: (value) => setState(() => _area = value!),
                  ),
                ],
                if (!_asStaff) ...[
                  const SizedBox(height: 22),
                  _ProviderButton(
                    icon: Icons.g_mobiledata_rounded,
                    label: 'Continuar con Google',
                    loading: _loadingProvider,
                    onTap: () => _continueWithProvider('Google'),
                  ),
                  const SizedBox(height: 12),
                  _ProviderButton(
                    icon: Icons.apple,
                    label: 'Continuar con Apple',
                    loading: _loadingProvider,
                    onTap: () => _continueWithProvider('Apple'),
                  ),
                  const SizedBox(height: 22),
                  Row(children: [
                    Expanded(child: Divider(color: scheme.outlineVariant)),
                    Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 10),
                      child: Text('o continúa con',
                          style: textTheme.bodySmall?.copyWith(
                              color: scheme.onSurface.withValues(alpha: 0.5))),
                    ),
                    Expanded(child: Divider(color: scheme.outlineVariant)),
                  ]),
                ],
                const SizedBox(height: 18),
                SegmentedButton<bool>(
                  segments: const [
                    ButtonSegment(
                        value: false,
                        label: Text('Correo'),
                        icon: Icon(Icons.mail_outline)),
                    ButtonSegment(
                        value: true,
                        label: Text('Teléfono'),
                        icon: Icon(Icons.phone_outlined)),
                  ],
                  selected: {_byPhone},
                  onSelectionChanged: (value) =>
                      setState(() => _byPhone = value.first),
                ),
                const SizedBox(height: 18),
                TextField(
                  controller: _name,
                  textCapitalization: TextCapitalization.words,
                  decoration:
                      const InputDecoration(labelText: 'Nombre completo'),
                ),
                const SizedBox(height: 14),
                if (_byPhone)
                  TextField(
                    controller: _phone,
                    keyboardType: TextInputType.phone,
                    decoration: const InputDecoration(
                        labelText: 'Teléfono', prefixText: '+57 '),
                  )
                else ...[
                  TextField(
                    controller: _email,
                    keyboardType: TextInputType.emailAddress,
                    decoration: const InputDecoration(labelText: 'Correo'),
                  ),
                  const SizedBox(height: 14),
                  TextField(
                    controller: _password,
                    obscureText: true,
                    onChanged: (_) => setState(() {}),
                    decoration: const InputDecoration(labelText: 'Contraseña'),
                  ),
                  PasswordStrengthMeter(password: _password.text),
                  const SizedBox(height: 14),
                  TextField(
                    controller: _confirm,
                    obscureText: true,
                    onSubmitted: (_) => _submit(),
                    decoration: const InputDecoration(
                        labelText: 'Confirmar contraseña'),
                  ),
                ],
                const SizedBox(height: 8),
                InkWell(
                  onTap: () => setState(() => _acceptedTerms = !_acceptedTerms),
                  borderRadius: BorderRadius.circular(10),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.center,
                    children: [
                      Checkbox(
                        value: _acceptedTerms,
                        onChanged: (value) =>
                            setState(() => _acceptedTerms = value ?? false),
                      ),
                      Expanded(
                        child: Text(
                            'Acepto los términos y la política de privacidad',
                            style: textTheme.bodySmall),
                      ),
                    ],
                  ),
                ),
                if (_error != null)
                  Padding(
                    padding: const EdgeInsets.only(top: 4, bottom: 4),
                    child: Text(_error!, style: TextStyle(color: scheme.error)),
                  ),
                const SizedBox(height: 12),
                LoadingFilledButton(
                  label: _byPhone ? 'Enviar código' : 'Crear cuenta',
                  onPressed: _acceptedTerms ? _submit : null,
                ),
                const SizedBox(height: 14),
                Center(
                  child: TextButton(
                    onPressed: () => Navigator.of(context).pop(),
                    child: const Text('¿Ya tienes cuenta? Inicia sesión'),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _ProviderButton extends StatelessWidget {
  const _ProviderButton({
    required this.icon,
    required this.label,
    required this.loading,
    required this.onTap,
  });

  final IconData icon;
  final String label;
  final bool loading;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final isDark = scheme.brightness == Brightness.dark;
    return InkWell(
      onTap: loading ? null : onTap,
      borderRadius: BorderRadius.circular(16),
      child: Container(
        height: 52,
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(16),
          color: Colors.white.withValues(alpha: isDark ? 0.10 : 0.55),
          border: Border.all(
              color: Colors.white.withValues(alpha: isDark ? 0.22 : 0.7)),
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            if (loading)
              SizedBox(
                width: 20,
                height: 20,
                child: CircularProgressIndicator(
                    strokeWidth: 2, color: scheme.onSurface),
              )
            else ...[
              Icon(icon, color: scheme.onSurface, size: 22),
              const SizedBox(width: 10),
              Text(label,
                  style: TextStyle(
                      fontWeight: FontWeight.w600, color: scheme.onSurface)),
            ],
          ],
        ),
      ),
    );
  }
}
