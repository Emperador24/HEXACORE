import 'package:flutter/material.dart';
import '../services/pedidos_api.dart';
import '../widgets/liquid_glass.dart';
import 'pedidos_page.dart' show importePedido;

class RestaurantMenuPage extends StatefulWidget {
  const RestaurantMenuPage(
      {super.key,
      this.api,
      this.eventoId = 'e0000001-0000-4000-8000-000000000001'});
  final PedidosApi? api;
  final String eventoId;
  @override
  State<RestaurantMenuPage> createState() => _RestaurantMenuPageState();
}

class _RestaurantMenuPageState extends State<RestaurantMenuPage> {
  late final api = widget.api ?? PedidosApi.instance;
  List<DatosPedido> locales = [], productos = [];
  String? seleccionado, error, aviso;
  bool cargando = true, guardando = false;

  @override
  void initState() {
    super.initState();
    cargar();
  }

  Future<void> cargar() async {
    if (guardando) return;
    setState(() {
      cargando = true;
      error = null;
      aviso = null;
    });
    try {
      if (seleccionado == null) {
        final lista = await api.establecimientos(widget.eventoId);
        if (!mounted) return;
        locales = lista;
        seleccionado = lista.isEmpty ? null : lista.first['id'] as String;
      }
      final lista = seleccionado == null
          ? <DatosPedido>[]
          : await api.menu(seleccionado!);
      if (!mounted) return;
      setState(() => productos = lista);
    } catch (_) {
      if (mounted) {
        setState(() => error = 'No pudimos cargar el menú. Vuelve a intentar.');
      }
    } finally {
      if (mounted) setState(() => cargando = false);
    }
  }

  Future<void> cambiar(DatosPedido producto, bool activo) async {
    if (guardando || cargando) return;
    setState(() {
      guardando = true;
      aviso = null;
    });
    try {
      final actualizado = await api.actualizarDisponibilidad(
          seleccionado!, producto['id'] as String, activo);
      if (!mounted) return;
      setState(() {
        productos = productos
            .map((p) => p['id'] == actualizado['id'] ? actualizado : p)
            .toList();
        aviso = 'Disponibilidad actualizada.';
      });
    } catch (_) {
      if (mounted) {
        setState(() => aviso =
            'No pudimos confirmar el cambio. Actualiza el menú para comprobar su estado.');
      }
    } finally {
      if (mounted) setState(() => guardando = false);
    }
  }

  @override
  Widget build(BuildContext context) => RefreshIndicator(
        onRefresh: cargando || guardando ? () async {} : cargar,
        child: ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.all(16),
            children: [
              Text('Menú', style: Theme.of(context).textTheme.headlineSmall),
              const Padding(
                  padding: EdgeInsets.symmetric(vertical: 12),
                  child: Text(
                      'Elige qué productos están disponibles para tus clientes.')),
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
                    onChanged: cargando || guardando
                        ? null
                        : (valor) {
                            if (valor != null) {
                              seleccionado = valor;
                              cargar();
                            }
                          }),
              const SizedBox(height: 16),
              if (guardando) const LinearProgressIndicator(),
              if (aviso != null)
                Padding(
                    padding: const EdgeInsets.symmetric(vertical: 12),
                    child: Text(aviso!, semanticsLabel: aviso)),
              if (cargando)
                const Center(child: CircularProgressIndicator())
              else if (error != null) ...[
                Text(error!),
                OutlinedButton(
                    onPressed: cargar, child: const Text('Reintentar')),
              ] else if (locales.isEmpty)
                const Text(
                    'No hay establecimientos disponibles para este evento.')
              else if (productos.isEmpty)
                const Text('Este establecimiento aún no tiene productos.')
              else
                for (final producto in productos)
                  Padding(
                      padding: const EdgeInsets.only(bottom: 12),
                      child: LiquidGlassCard(
                          child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                            Text(producto['nombre'] as String,
                                style: Theme.of(context).textTheme.titleMedium),
                            if (producto['descripcion'] != null)
                              Text(producto['descripcion'] as String),
                            Text(importePedido(producto['precio'])),
                            Row(children: [
                              Expanded(
                                  child: Text(producto['activo'] == true
                                      ? 'Disponible para venta'
                                      : 'No disponible para venta')),
                              Switch(
                                  value: producto['activo'] == true,
                                  onChanged: guardando
                                      ? null
                                      : (valor) => cambiar(producto, valor)),
                            ]),
                          ]))),
            ]),
      );
}
