import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../widgets/liquid_glass.dart';

const _kRed = Color(0xFFFF5A5F);

// recuperar contraseña: correo, código OTP y nueva contraseña
class ForgotPasswordPage extends StatefulWidget {
  const ForgotPasswordPage({super.key});

  @override
  State<ForgotPasswordPage> createState() => _ForgotPasswordPageState();
}

class _ForgotPasswordPageState extends State<ForgotPasswordPage> {
  final _email = TextEditingController();
  String? _error;

  @override
  void dispose() {
    _email.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final value = _email.text.trim();
    if (value.isEmpty || !value.contains('@')) {
      setState(() => _error = 'Ingresa un correo válido.');
      return;
    }
    await Future.delayed(const Duration(milliseconds: 700));
    if (!mounted) return;
    Navigator.of(context).push(
        MaterialPageRoute(builder: (_) => _ResetOtpPage(destination: value)));
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return GlassScaffold(
      appBar: const GlassAppBar(title: Text('Recuperar contraseña')),
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: EdgeInsets.fromLTRB(
                24,
                kToolbarHeight + MediaQuery.of(context).padding.top + 24,
                24,
                24),
            child: LiquidGlassCard(
              padding: const EdgeInsets.all(28),
              borderRadius: BorderRadius.circular(32),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Icon(Icons.lock_reset_outlined,
                      color: scheme.primary, size: 48),
                  const SizedBox(height: 16),
                  Text('¿Olvidaste tu contraseña?',
                      textAlign: TextAlign.center,
                      style: Theme.of(context).textTheme.titleLarge),
                  const SizedBox(height: 8),
                  Text(
                      'Ingresa tu correo y te enviaremos un código para restablecerla.',
                      textAlign: TextAlign.center,
                      style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                          color: scheme.onSurface.withValues(alpha: 0.6))),
                  const SizedBox(height: 24),
                  TextField(
                    controller: _email,
                    keyboardType: TextInputType.emailAddress,
                    onSubmitted: (_) => _submit(),
                    decoration: const InputDecoration(labelText: 'Correo'),
                  ),
                  if (_error != null)
                    Padding(
                      padding: const EdgeInsets.only(top: 10),
                      child:
                          Text(_error!, style: const TextStyle(color: _kRed)),
                    ),
                  const SizedBox(height: 20),
                  LoadingFilledButton(
                      label: 'Enviar código', onPressed: _submit),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _ResetOtpPage extends StatefulWidget {
  const _ResetOtpPage({required this.destination});
  final String destination;

  @override
  State<_ResetOtpPage> createState() => _ResetOtpPageState();
}

class _ResetOtpPageState extends State<_ResetOtpPage> {
  static const _validCode = '123456';
  static const _resendSeconds = 30;

  final _controllers = List.generate(6, (_) => TextEditingController());
  final _nodes = List.generate(6, (_) => FocusNode());
  final _keyNodes = List.generate(6, (_) => FocusNode(skipTraversal: true));
  Timer? _timer;
  int _secondsLeft = _resendSeconds;
  String? _error;

  @override
  void initState() {
    super.initState();
    _startTimer();
  }

  void _startTimer() {
    _timer?.cancel();
    setState(() => _secondsLeft = _resendSeconds);
    _timer = Timer.periodic(const Duration(seconds: 1), (timer) {
      if (_secondsLeft <= 1) {
        timer.cancel();
        setState(() => _secondsLeft = 0);
      } else {
        setState(() => _secondsLeft -= 1);
      }
    });
  }

  @override
  void dispose() {
    _timer?.cancel();
    for (final c in _controllers) {
      c.dispose();
    }
    for (final n in _nodes) {
      n.dispose();
    }
    for (final n in _keyNodes) {
      n.dispose();
    }
    super.dispose();
  }

  String get _code => _controllers.map((c) => c.text).join();

  void _onDigitChanged(int index, String value) {
    if (value.isNotEmpty && index < 5) {
      _nodes[index + 1].requestFocus();
    }
    if (_error != null) setState(() => _error = null);
    if (_code.length == 6) _verify();
  }

  void _onBackspace(int index) {
    if (_controllers[index].text.isEmpty && index > 0) {
      _nodes[index - 1].requestFocus();
      _controllers[index - 1].clear();
    }
  }

  Future<void> _verify() async {
    if (_code.length < 6) return;
    await Future.delayed(const Duration(milliseconds: 700));
    if (!mounted) return;
    if (_code == _validCode) {
      Navigator.of(context)
          .push(MaterialPageRoute(builder: (_) => const _NewPasswordPage()));
      return;
    }
    setState(() => _error = 'Código incorrecto, intenta de nuevo.');
    for (final c in _controllers) {
      c.clear();
    }
    _nodes.first.requestFocus();
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final textTheme = Theme.of(context).textTheme;
    return GlassScaffold(
      appBar: const GlassAppBar(title: Text('Verificar código')),
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: EdgeInsets.fromLTRB(
                24,
                kToolbarHeight + MediaQuery.of(context).padding.top + 24,
                24,
                24),
            child: LiquidGlassCard(
              padding: const EdgeInsets.all(28),
              borderRadius: BorderRadius.circular(32),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Icon(Icons.mark_email_read_outlined,
                      color: scheme.primary, size: 48),
                  const SizedBox(height: 16),
                  Text('Enviamos un código a\n${widget.destination}',
                      textAlign: TextAlign.center,
                      style: textTheme.titleMedium),
                  const SizedBox(height: 24),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      for (var i = 0; i < 6; i++)
                        SizedBox(
                          width: 44,
                          height: 56,
                          child: KeyboardListener(
                            focusNode: _keyNodes[i],
                            onKeyEvent: (event) {
                              if (event is KeyDownEvent &&
                                  event.logicalKey ==
                                      LogicalKeyboardKey.backspace) {
                                _onBackspace(i);
                              }
                            },
                            child: TextField(
                              controller: _controllers[i],
                              focusNode: _nodes[i],
                              textAlign: TextAlign.center,
                              keyboardType: TextInputType.number,
                              maxLength: 1,
                              style: textTheme.titleLarge,
                              inputFormatters: [
                                FilteringTextInputFormatter.digitsOnly
                              ],
                              decoration:
                                  const InputDecoration(counterText: ''),
                              onChanged: (value) => _onDigitChanged(i, value),
                              onSubmitted: (_) => _verify(),
                            ),
                          ),
                        ),
                    ],
                  ),
                  if (_error != null) ...[
                    const SizedBox(height: 12),
                    Text(_error!,
                        textAlign: TextAlign.center,
                        style: TextStyle(
                            color: scheme.error, fontWeight: FontWeight.w600)),
                  ],
                  const SizedBox(height: 18),
                  Text('Código de prueba: 123456',
                      textAlign: TextAlign.center,
                      style: textTheme.bodySmall?.copyWith(
                          color: scheme.onSurface.withValues(alpha: 0.5))),
                  const SizedBox(height: 20),
                  LoadingFilledButton(
                    label: 'Verificar',
                    onPressed: _code.length == 6 ? _verify : null,
                  ),
                  const SizedBox(height: 14),
                  Center(
                    child: _secondsLeft > 0
                        ? Text(
                            'Reenviar código en 0:${_secondsLeft.toString().padLeft(2, '0')}',
                            style: textTheme.bodySmall?.copyWith(
                                color: scheme.onSurface.withValues(alpha: 0.5)))
                        : TextButton(
                            onPressed: _startTimer,
                            child: const Text('Reenviar código'),
                          ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _NewPasswordPage extends StatefulWidget {
  const _NewPasswordPage();

  @override
  State<_NewPasswordPage> createState() => _NewPasswordPageState();
}

class _NewPasswordPageState extends State<_NewPasswordPage> {
  final _password = TextEditingController();
  final _confirm = TextEditingController();
  String? _error;

  @override
  void dispose() {
    _password.dispose();
    _confirm.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
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
    await Future.delayed(const Duration(milliseconds: 700));
    if (!mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
        content: Text('Contraseña restablecida. Ya puedes iniciar sesión.')));
    Navigator.of(context).popUntil((route) => route.isFirst);
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return GlassScaffold(
      appBar: const GlassAppBar(title: Text('Nueva contraseña')),
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: EdgeInsets.fromLTRB(
                24,
                kToolbarHeight + MediaQuery.of(context).padding.top + 24,
                24,
                24),
            child: LiquidGlassCard(
              padding: const EdgeInsets.all(28),
              borderRadius: BorderRadius.circular(32),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Icon(Icons.password_outlined,
                      color: scheme.primary, size: 48),
                  const SizedBox(height: 16),
                  Text('Crea una nueva contraseña',
                      textAlign: TextAlign.center,
                      style: Theme.of(context).textTheme.titleLarge),
                  const SizedBox(height: 24),
                  TextField(
                    controller: _password,
                    obscureText: true,
                    onChanged: (_) => setState(() {}),
                    decoration:
                        const InputDecoration(labelText: 'Nueva contraseña'),
                  ),
                  PasswordStrengthMeter(password: _password.text),
                  const SizedBox(height: 14),
                  TextField(
                    controller: _confirm,
                    obscureText: true,
                    onSubmitted: (_) => _submit(),
                    decoration: const InputDecoration(
                        labelText: 'Confirmar nueva contraseña'),
                  ),
                  if (_error != null)
                    Padding(
                      padding: const EdgeInsets.only(top: 10),
                      child:
                          Text(_error!, style: const TextStyle(color: _kRed)),
                    ),
                  const SizedBox(height: 20),
                  LoadingFilledButton(
                      label: 'Restablecer contraseña', onPressed: _submit),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
