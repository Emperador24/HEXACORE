import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../main.dart' show User;
import '../widgets/liquid_glass.dart';

// verificación OTP tras el registro, código de prueba fijo
class OtpPage extends StatefulWidget {
  const OtpPage({
    super.key,
    required this.destination,
    required this.pendingUser,
    required this.onVerified,
  });

  final String destination;
  final User pendingUser;
  final ValueChanged<User> onVerified;

  @override
  State<OtpPage> createState() => _OtpPageState();
}

class _OtpPageState extends State<OtpPage> {
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
      widget.onVerified(widget.pendingUser);
      Navigator.of(context).popUntil((route) => route.isFirst);
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
