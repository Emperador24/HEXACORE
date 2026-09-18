import 'package:flutter/material.dart';

import '../services/cuentas_api.dart';
import '../widgets/liquid_glass.dart';
import 'formulario_cuenta.dart';

/// Pasos 5-7 del CU-027: la cuenta se activa con el enlace del correo.
///
/// El enlace apunta al portal web. Como la app todavía no abre enlaces
/// directamente (*deep links*), se puede pegar aquí el enlace completo o solo
/// el código que lleva.
class VerificarCuentaPage extends StatefulWidget {
  const VerificarCuentaPage({super.key, this.email, this.mensaje});

  /// El correo con que se registró, si se viene del registro.
  final String? email;

  /// Lo que respondió el registro. Es el mismo texto exista o no el correo.
  final String? mensaje;

  @override
  State<VerificarCuentaPage> createState() => _VerificarCuentaPageState();
}

class _VerificarCuentaPageState extends State<VerificarCuentaPage> {
  final _enlace = TextEditingController();
  String? _error;

  @override
  void dispose() {
    _enlace.dispose();
    super.dispose();
  }

  Future<void> _activar() async {
    final token = tokenDeEnlace(_enlace.text);
    if (token == null) {
      setState(
          () => _error = 'Pega el enlace completo que te llegó por correo.');
      return;
    }
    final mensajero = ScaffoldMessenger.of(context);
    final navegador = Navigator.of(context);
    try {
      final mensaje = await cuentasApi.verificar(token);
      navegador.popUntil((ruta) => ruta.isFirst);
      avisar(mensajero, mensaje);
    } on CuentasApiException catch (error) {
      if (mounted) setState(() => _error = error.mensaje);
    }
  }

  @override
  Widget build(BuildContext context) {
    final destino = widget.email == null ? 'tu correo' : widget.email!;
    return TarjetaFormulario(
      titulo: 'Activar cuenta',
      icono: Icons.mark_email_read_outlined,
      encabezado: 'Revisa $destino',
      explicacion: widget.mensaje ??
          'Te enviamos un enlace para activar tu cuenta. Ábrelo, o pégalo aquí.',
      hijos: [
        TextField(
          key: const Key('campo-enlace'),
          controller: _enlace,
          autocorrect: false,
          minLines: 1,
          maxLines: 3,
          onSubmitted: (_) => _activar(),
          decoration: const InputDecoration(labelText: 'Enlace del correo'),
        ),
        TextoError(_error),
        const SizedBox(height: 20),
        LoadingFilledButton(
            key: const Key('boton-activar'),
            label: 'Activar cuenta',
            onPressed: _activar),
        const AyudaBuzonDesarrollo(),
      ],
    );
  }
}
