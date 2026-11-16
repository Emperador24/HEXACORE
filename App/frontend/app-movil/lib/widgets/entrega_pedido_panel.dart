import 'package:flutter/material.dart';
import '../services/pedidos_api.dart';
import 'qr_scanner_sheet.dart';
import 'sondeo_pedidos.dart' show fechaPedido;
import 'liquid_glass.dart';

class EntregaPedidoPanel extends StatefulWidget {
  const EntregaPedidoPanel(
      {super.key,
      required this.api,
      required this.local,
      required this.alEntregar,
      required this.alOcupar,
      required this.alPendiente,
      this.inactivo = false});
  final PedidosApi api;
  final String local;
  final bool inactivo;
  final VoidCallback alEntregar;
  final ValueChanged<bool> alOcupar, alPendiente;
  @override
  State<EntregaPedidoPanel> createState() => _EntregaPedidoPanelState();
}

class _EntregaPedidoPanelState extends State<EntregaPedidoPanel> {
  DatosPedido? revision, pendiente, resultado;
  String? codigo, error;
  bool ocupado = false;
  @override
  void initState() {
    super.initState();
    cargarPendiente();
  }

  @override
  void didUpdateWidget(covariant EntregaPedidoPanel oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.local != widget.local) {
      codigo = null;
      revision = null;
      resultado = null;
      error = null;
      cargarPendiente();
    }
  }

  Future<void> cargarPendiente() async {
    final p = await widget.api.pendienteEntrega();
    if (mounted) {
      setState(() => pendiente = p);
      widget.alPendiente(p != null);
    }
  }

  void ocupar(bool valor) {
    if (mounted) setState(() => ocupado = valor);
    widget.alOcupar(valor);
  }

  Future<void> escanear() async {
    if (ocupado || widget.inactivo) return;
    final valor =
        await showQrScannerSheet(context, title: 'Escanear QR del pedido');
    if (mounted && valor != null) await validar(valor);
  }

  Future<void> ingresar() async {
    if (ocupado || widget.inactivo) return;
    final texto = TextEditingController();
    final clave = GlobalKey<FormState>();
    final ruta = DialogRoute<String>(
        context: context,
        builder: (ctx) => AlertDialog(
                title: const Text('Ingresar código completo'),
                content: Form(
                    key: clave,
                    child: TextFormField(
                        controller: texto,
                        autofocus: true,
                        maxLength: 80,
                        autocorrect: false,
                        decoration: const InputDecoration(
                            labelText: 'Código QR completo'),
                        validator: (v) => RegExp(r'^[a-fA-F0-9]{64}$')
                                .hasMatch((v ?? '').trim())
                            ? null
                            : 'Ingresa los 64 caracteres del código QR.')),
                actions: [
                  TextButton(
                      onPressed: () => Navigator.pop(ctx),
                      child: const Text('Cancelar')),
                  FilledButton(
                      onPressed: () {
                        if (clave.currentState!.validate()) {
                          Navigator.pop(ctx, texto.text.trim().toLowerCase());
                        }
                      },
                      child: const Text('Consultar código'))
                ]));
    final valor = await Navigator.of(context).push(ruta);
    await ruta.completed;
    texto.dispose();
    if (mounted && valor != null) await validar(valor);
  }

  Future<void> validar(String valor) async {
    if (ocupado || widget.inactivo) return;
    ocupar(true);
    setState(() {
      error = null;
      revision = null;
      resultado = null;
    });
    try {
      final p = await widget.api
          .prevalidarEntrega(widget.local, valor.trim().toLowerCase());
      if (!mounted) return;
      final i = pendiente;
      if (i != null &&
          (i['local'] != widget.local ||
              i['pedidoId'] != p['pedidoId'] ||
              i['version'] != p['version'] ||
              i['puntoRevision'] != p['puntoRevision'])) {
        throw PedidosException('Consulta primero la entrega pendiente.', 409);
      }
      setState(() {
        revision = p;
        codigo = valor.trim().toLowerCase();
      });
    } catch (e) {
      if (mounted) setState(() => error = e.toString());
    } finally {
      ocupar(false);
    }
  }

  Future<void> confirmar({bool recuperar = false}) async {
    if (ocupado ||
        widget.inactivo ||
        (recuperar ? pendiente == null : revision == null || codigo == null)) {
      return;
    }
    ocupar(true);
    setState(() => error = null);
    try {
      final r = recuperar
          ? await widget.api.repetirEntrega(pendiente!)
          : await widget.api.confirmarEntrega(widget.local, revision!, codigo!);
      if (mounted) {
        setState(() {
          resultado = r;
          revision = null;
        });
        widget.alEntregar();
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          error = e.toString();
          revision = null;
        });
      }
    } finally {
      codigo = null;
      await cargarPendiente();
      ocupar(false);
    }
  }

  @override
  Widget build(BuildContext context) => LiquidGlassCard(
          child:
              Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Text('Validar y entregar pedido',
            style: Theme.of(context).textTheme.titleLarge),
        const Text(
            'Consultar el código no entrega el pedido. Revisa el punto y confirma explícitamente.'),
        Wrap(spacing: 8, children: [
          OutlinedButton.icon(
              onPressed: ocupado || widget.inactivo ? null : escanear,
              icon: const Icon(Icons.qr_code_scanner),
              label: const Text('Escanear QR del pedido')),
          TextButton(
              onPressed: ocupado || widget.inactivo ? null : ingresar,
              child: const Text('Ingresar código completo'))
        ]),
        if (ocupado) const LinearProgressIndicator(),
        if (error != null) Text(error!, key: const Key('error-entrega')),
        if (pendiente != null) ...[
          const Text(
              'Entrega sin confirmar. Guardamos su identificador, sin el código QR.'),
          TextButton(
              onPressed: ocupado || widget.inactivo
                  ? null
                  : () => confirmar(recuperar: true),
              child: const Text('Consultar entrega pendiente'))
        ],
        if (revision case final p?) ...[
          Text('Pedido ${p['pedidoId']}'),
          Text('Punto autorizado: ${p['puntoEntrega']}'),
          Text('Total acordado: ${p['total']} ${p['moneda']}'),
          for (final d in p['productos'] as List)
            Text('${d['cantidad']} × ${d['nombreProducto']}'),
          const Text(
              'Listo para entregar. Confirma después de revisar el pedido y entregarlo al cliente.'),
          FilledButton(
              onPressed: ocupado || widget.inactivo ? null : confirmar,
              child: const Text('Confirmar entrega'))
        ],
        if (resultado case final r?)
          Text(
              'Pedido entregado en ${r['entrega']['puntoEntrega']} · ${fechaPedido(r['entrega']['entregadoEn'])}. El QR ya no permite otra entrega.',
              key: const Key('entrega-confirmada')),
      ]));
}
