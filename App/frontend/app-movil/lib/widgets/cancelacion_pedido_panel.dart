import 'package:flutter/material.dart';
import '../services/pedidos_api.dart';
import 'sondeo_pedidos.dart' show fechaPedido;

String estadoReembolsoPedido(dynamic e) => switch (e) {
      'PENDIENTE' => 'pendiente',
      'APROBADO' => 'aprobado',
      'RECHAZADO' => 'rechazado',
      'INCIERTO' => 'incierto',
      _ => 'sin confirmar'
    };

List<Widget> resumenCancelacion(Map c) {
  final r = c['reembolso'] as Map;
  return [
    Text('Pedido cancelado por el establecimiento: ${c['motivo']}'),
    Text('Fecha: ${fechaPedido(c['canceladoEn'])}'),
    Text(
        'Reembolso ${estadoReembolsoPedido(r['estado'])} · ${r['monto']} ${r['moneda']}'),
    Text(r['estado'] == 'APROBADO'
        ? 'La pasarela confirmó la aprobación del reembolso total.'
        : 'No se confirma dinero devuelto. El pedido permanece cancelado.'),
  ];
}

class CancelacionPedidoPanel extends StatefulWidget {
  const CancelacionPedidoPanel(
      {super.key,
      required this.api,
      required this.local,
      required this.pedido,
      required this.alCambiar,
      required this.alOcupar,
      required this.alPendiente,
      this.inactivo = false});
  final PedidosApi api;
  final String local;
  final DatosPedido pedido;
  final bool inactivo;
  final VoidCallback alCambiar;
  final ValueChanged<bool> alOcupar, alPendiente;
  @override
  State<CancelacionPedidoPanel> createState() => _CancelacionPedidoPanelState();
}

class _CancelacionPedidoPanelState extends State<CancelacionPedidoPanel> {
  DatosPedido? pendiente, resultado;
  String? error;
  bool ocupado = false;
  @override
  void initState() {
    super.initState();
    resultado = widget.pedido['cancelacion'] as DatosPedido?;
    cargarPendiente();
  }

  @override
  void didUpdateWidget(covariant CancelacionPedidoPanel oldWidget) {
    super.didUpdateWidget(oldWidget);
    resultado = widget.pedido['cancelacion'] as DatosPedido? ?? resultado;
  }

  Future<void> cargarPendiente() async {
    final i = await widget.api.pendienteCancelacion();
    if (mounted) {
      setState(() => pendiente = i);
      widget.alPendiente(i != null);
    }
  }

  void ocupar(bool v) {
    if (mounted) setState(() => ocupado = v);
    widget.alOcupar(v);
  }

  Future<void> formulario() async {
    if (ocupado || widget.inactivo) return;
    final p = widget.pedido,
        version = (widget.pedido['preparacion'] as Map)['version'];
    final motivo = TextEditingController(), clave = GlobalKey<FormState>();
    var confirmado = false;
    ocupar(true);
    final ruta = DialogRoute<DatosPedido>(
        context: context,
        builder: (ctx) => StatefulBuilder(
            builder: (ctx, cambiar) => AlertDialog(
                  title: const Text('Cancelar pedido'),
                  content: SingleChildScrollView(
                      child: Form(
                          key: clave,
                          child:
                              Column(mainAxisSize: MainAxisSize.min, children: [
                            TextFormField(
                                controller: motivo,
                                maxLength: 200,
                                minLines: 2,
                                maxLines: 4,
                                decoration: const InputDecoration(
                                    labelText: 'Motivo de cancelación'),
                                validator: (v) => (v?.trim().length ?? 0) < 3
                                    ? 'Indica el motivo.'
                                    : null),
                            const Text(
                                'La cancelación impide preparar y entregar. El reembolso tiene seguimiento independiente. No se reincorpora comida preparada.'),
                            CheckboxListTile(
                                value: confirmado,
                                onChanged: (v) =>
                                    cambiar(() => confirmado = v == true),
                                title: const Text(
                                    'Confirmo cancelar este pedido y solicitar su reembolso total')),
                          ]))),
                  actions: [
                    TextButton(
                        onPressed: () => Navigator.pop(ctx),
                        child: const Text('Volver sin cancelar')),
                    FilledButton(
                        onPressed: !confirmado
                            ? null
                            : () {
                                if (clave.currentState!.validate()) {
                                  Navigator.pop(ctx, <String, dynamic>{
                                    'version': version,
                                    'motivo': motivo.text.trim(),
                                    'confirmar': true
                                  });
                                }
                              },
                        child: const Text('Confirmar cancelación'))
                  ],
                )));
    final datos = await Navigator.of(context).push(ruta);
    await ruta.completed;
    motivo.dispose();
    ocupar(false);
    if (datos != null && mounted && widget.pedido['id'] == p['id']) {
      await enviar(datos: datos);
    }
  }

  Future<void> enviar({DatosPedido? datos}) async {
    if (ocupado || widget.inactivo) return;
    ocupar(true);
    setState(() => error = null);
    try {
      final r = datos == null
          ? await widget.api.repetirCancelacion(pendiente!)
          : await widget.api.cancelarPedido(
              widget.local, widget.pedido['id'] as String, datos);
      if (mounted) setState(() => resultado = r);
    } catch (e) {
      if (mounted) setState(() => error = e.toString());
    } finally {
      await cargarPendiente();
      ocupar(false);
      if (mounted) widget.alCambiar();
    }
  }

  Future<void> consultar() async {
    if (ocupado || widget.inactivo) return;
    ocupar(true);
    setState(() => error = null);
    try {
      final r = await widget.api
          .consultarCancelacion(widget.local, widget.pedido['id'] as String);
      if (mounted) setState(() => resultado = r);
    } catch (e) {
      if (mounted) setState(() => error = e.toString());
    } finally {
      ocupar(false);
      if (mounted) widget.alCambiar();
    }
  }

  @override
  Widget build(BuildContext context) =>
      Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        const Text('Cancelación por el establecimiento'),
        if (error != null) Text(error!),
        if (resultado != null) ...[
          ...resumenCancelacion(resultado!),
          Text(
              'Inventario: ${resultado!['inventario']}. No se reincorpora automáticamente comida preparada.'),
          TextButton(
              onPressed: ocupado || widget.inactivo ? null : consultar,
              child: const Text('Consultar cancelación y reembolso')),
        ] else if (widget.pedido['estado'] == 'CONFIRMADO' &&
            widget.pedido['pagoVerificado'] == true &&
            widget.pedido['entrega'] == null &&
            pendiente == null)
          OutlinedButton(
              onPressed: ocupado || widget.inactivo ? null : formulario,
              child: const Text('Cancelar pedido')),
        if (pendiente != null) ...[
          const Text(
              'Cancelación sin respuesta confirmada. Se conserva la misma operación.'),
          FilledButton(
              onPressed: ocupado || widget.inactivo ? null : () => enviar(),
              child: const Text('Consultar cancelación pendiente')),
        ],
      ]);
}
