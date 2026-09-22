import 'package:flutter/material.dart';
import '../services/pedidos_api.dart';
import '../widgets/liquid_glass.dart';
import 'pedidos_page.dart' show importePedido;

/// Bandeja de lectura de CU-011. No gestiona preparación, cobro ni entrega.
class RestaurantOrdersPage extends StatefulWidget {
  const RestaurantOrdersPage(
      {super.key,
      this.api,
      this.eventoId = 'e0000001-0000-4000-8000-000000000001'});
  final PedidosApi? api;
  final String eventoId;
  @override
  State<RestaurantOrdersPage> createState() => _RestaurantOrdersPageState();
}

class _RestaurantOrdersPageState extends State<RestaurantOrdersPage> {
  late final api = widget.api ?? PedidosApi.instance;
  List<DatosPedido> locales = [];
  List<DatosPedido> pedidos = [];
  String? seleccionado;
  String? error;
  bool cargando = true;
  int solicitud = 0;
  @override
  void initState() {
    super.initState();
    cargarCatalogo();
  }

  Future<void> cargarCatalogo() async {
    setState(() {
      cargando = true;
      error = null;
    });
    try {
      final resultado = await api.establecimientos(widget.eventoId);
      if (!mounted) return;
      setState(() {
        locales = resultado;
        seleccionado =
            resultado.isEmpty ? null : resultado.first['id'] as String;
      });
      if (seleccionado != null) {
        await cargarPedidos(seleccionado!);
      } else {
        setState(() => cargando = false);
      }
    } catch (_) {
      if (mounted) {
        setState(() {
          error = 'No se pudieron cargar los establecimientos.';
          cargando = false;
        });
      }
    }
  }

  Future<void> cargarPedidos(String local) async {
    final turno = ++solicitud;
    setState(() {
      seleccionado = local;
      cargando = true;
      error = null;
      pedidos = [];
    });
    try {
      final resultado = await api.recibidos(local);
      if (!mounted || turno != solicitud) return;
      setState(() {
        pedidos = resultado;
        cargando = false;
      });
    } catch (_) {
      if (!mounted || turno != solicitud) return;
      setState(() {
        error = 'No pudimos consultar los pedidos. Vuelve a intentar.';
        cargando = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) => RefreshIndicator(
        onRefresh: () => seleccionado == null
            ? cargarCatalogo()
            : cargarPedidos(seleccionado!),
        child: ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.all(16),
            children: [
              Text('Pedidos recibidos',
                  style: Theme.of(context).textTheme.headlineSmall),
              const Padding(
                  padding: EdgeInsets.symmetric(vertical: 12),
                  child: Text('Compras confirmadas de tu establecimiento.')),
              if (locales.isNotEmpty)
                DropdownButtonFormField<String>(
                    initialValue: seleccionado,
                    isExpanded: true,
                    decoration:
                        const InputDecoration(labelText: 'Establecimiento'),
                    items: locales
                        .map((e) => DropdownMenuItem(
                            value: e['id'] as String,
                            child: Text(e['nombre'] as String)))
                        .toList(),
                    onChanged: cargando
                        ? null
                        : (valor) {
                            if (valor != null) cargarPedidos(valor);
                          }),
              const SizedBox(height: 16),
              if (cargando)
                const Center(child: CircularProgressIndicator())
              else if (error != null) ...[
                Text(error!),
                OutlinedButton(
                    onPressed: () => seleccionado == null
                        ? cargarCatalogo()
                        : cargarPedidos(seleccionado!),
                    child: const Text('Reintentar')),
              ] else if (locales.isEmpty)
                const Text(
                    'No hay establecimientos disponibles para este evento.')
              else if (pedidos.isEmpty)
                const Text(
                    'Aún no hay pedidos confirmados en este establecimiento.')
              else
                for (final pedido in pedidos)
                  Padding(
                      padding: const EdgeInsets.only(bottom: 16),
                      child: LiquidGlassCard(
                          child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                            const Row(children: [
                              Icon(Icons.check_circle_outline),
                              SizedBox(width: 8),
                              Text('Pedido confirmado')
                            ]),
                            if (pedido['confirmadoEn'] != null)
                              Padding(
                                  padding:
                                      const EdgeInsets.symmetric(vertical: 8),
                                  child: Text(
                                      'Recibido: ${DateTime.parse(pedido['confirmadoEn'] as String).toLocal().toString().substring(0, 16)}')),
                            for (final producto in pedido['productos'] as List)
                              Padding(
                                  padding:
                                      const EdgeInsets.symmetric(vertical: 6),
                                  child: Text(
                                      '${producto['cantidad']} × ${producto['nombreProducto']}')),
                            const Divider(),
                            Text(
                                'Total: ${importePedido(pedido['total'], pedido['moneda'] as String)}',
                                style: Theme.of(context).textTheme.titleMedium),
                          ]))),
            ]),
      );
}
