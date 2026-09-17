import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';

import '../services/servidor.dart';
import '../widgets/liquid_glass.dart';

/// Esqueleto común de las pantallas de cuenta: registro, verificación y
/// recuperación de contraseña.
class TarjetaFormulario extends StatelessWidget {
  const TarjetaFormulario({
    super.key,
    required this.titulo,
    required this.icono,
    required this.encabezado,
    required this.explicacion,
    required this.hijos,
  });

  final String titulo;
  final IconData icono;
  final String encabezado;
  final String explicacion;
  final List<Widget> hijos;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final textos = Theme.of(context).textTheme;
    return GlassScaffold(
      appBar: GlassAppBar(title: Text(titulo)),
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
                  Icon(icono, color: scheme.primary, size: 48),
                  const SizedBox(height: 16),
                  Text(encabezado,
                      textAlign: TextAlign.center, style: textos.titleLarge),
                  const SizedBox(height: 8),
                  Text(explicacion,
                      textAlign: TextAlign.center,
                      style: textos.bodyMedium?.copyWith(
                          color: scheme.onSurface.withValues(alpha: 0.6))),
                  const SizedBox(height: 24),
                  ...hijos,
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

/// Mensaje de error bajo un formulario. El texto viene del servidor.
class TextoError extends StatelessWidget {
  const TextoError(this.texto, {super.key});
  final String? texto;

  @override
  Widget build(BuildContext context) {
    if (texto == null) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.only(top: 10),
      child: Text(texto!,
          key: const Key('error-formulario'),
          style: TextStyle(color: Theme.of(context).colorScheme.error)),
    );
  }
}

/// Solo en desarrollo: dónde están los correos.
///
/// En desarrollo no se envían correos de verdad; los recibe un simulador
/// (`App/infra/correo-simulado`). Sin esta pista no habría forma de encontrar
/// el enlace de verificación desde el teléfono. En una compilación de
/// producción no aparece.
class AyudaBuzonDesarrollo extends StatelessWidget {
  const AyudaBuzonDesarrollo({super.key});

  @override
  Widget build(BuildContext context) {
    if (!kDebugMode) return const SizedBox.shrink();
    final scheme = Theme.of(context).colorScheme;
    return Padding(
      padding: const EdgeInsets.only(top: 16),
      child: SelectableText(
        'Desarrollo: los correos no se envían de verdad. Ábrelos en '
        '${Servidor.buzonDesarrollo}?para=<tu correo>',
        textAlign: TextAlign.center,
        style: Theme.of(context)
            .textTheme
            .bodySmall
            ?.copyWith(color: scheme.onSurface.withValues(alpha: 0.5)),
      ),
    );
  }
}

/// Campo de contraseña con botón para mostrarla.
class CampoContrasena extends StatefulWidget {
  const CampoContrasena({
    super.key,
    required this.controlador,
    required this.etiqueta,
    this.alCambiar,
    this.alEnviar,
  });

  final TextEditingController controlador;
  final String etiqueta;
  final ValueChanged<String>? alCambiar;
  final ValueChanged<String>? alEnviar;

  @override
  State<CampoContrasena> createState() => _CampoContrasenaState();
}

class _CampoContrasenaState extends State<CampoContrasena> {
  bool _oculta = true;

  @override
  Widget build(BuildContext context) => TextField(
        controller: widget.controlador,
        obscureText: _oculta,
        autocorrect: false,
        enableSuggestions: false,
        onChanged: widget.alCambiar,
        onSubmitted: widget.alEnviar,
        decoration: InputDecoration(
          labelText: widget.etiqueta,
          suffixIcon: IconButton(
            icon: Icon(_oculta
                ? Icons.visibility_outlined
                : Icons.visibility_off_outlined),
            onPressed: () => setState(() => _oculta = !_oculta),
          ),
        ),
      );
}

/// Muestra un aviso en la pantalla que quede después de cerrar esta.
void avisar(ScaffoldMessengerState mensajero, String texto) =>
    mensajero.showSnackBar(SnackBar(content: Text(texto)));
