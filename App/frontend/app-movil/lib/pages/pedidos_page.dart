import 'package:flutter/material.dart';
import 'package:qr_flutter/qr_flutter.dart';
import '../services/pedidos_api.dart';
import '../widgets/liquid_glass.dart';

/// La cartelera aún es simulada: mismo evento demo del portal, reemplazable al navegar.
class PedidosPage extends StatefulWidget {
  const PedidosPage(
      {super.key,
      this.eventoId = 'e0000001-0000-4000-8000-000000000001',
      this.api});
  final String eventoId;
  final PedidosApi? api;
  @override
  State<PedidosPage> createState() => _PedidosPageState();
}

class _PedidosPageState extends State<PedidosPage> {
  late final api = widget.api ?? PedidosApi.instance;
  late Future<List<DatosPedido>> catalogo;
  @override
  void initState() {
    super.initState();
    catalogo = api.establecimientos(widget.eventoId);
  }

  @override
  Widget build(BuildContext context) => FutureBuilder<List<DatosPedido>>(
        future: catalogo,
        builder: (context, snapshot) =>
            ListView(padding: const EdgeInsets.all(16), children: [
          Text('¿Qué se te antoja?',
              style: Theme.of(context).textTheme.headlineSmall),
          const Padding(
              padding: EdgeInsets.symmetric(vertical: 12),
              child: Text('Elige dónde pedir durante tu evento.')),
          if (snapshot.connectionState != ConnectionState.done)
            const Center(child: CircularProgressIndicator())
          else if (snapshot.hasError) ...[
            const Text('No pudimos cargar los establecimientos.'),
            OutlinedButton(
                onPressed: () => setState(
                    () => catalogo = api.establecimientos(widget.eventoId)),
                child: const Text('Volver a intentar')),
          ] else if (snapshot.data!.isEmpty)
            const Text('No hay establecimientos disponibles en este momento.')
          else
            for (final local in snapshot.data!)
              Padding(
                  padding: const EdgeInsets.only(bottom: 12),
                  child: LiquidGlassCard(
                      child: Material(
                          type: MaterialType.transparency,
                          child: ListTile(
                            contentPadding: EdgeInsets.zero,
                            leading: const Icon(Icons.storefront_outlined),
                            title: Text(local['nombre'] as String),
                            subtitle: Text(local['puntoEntrega'] as String),
                            trailing: const Icon(Icons.chevron_right),
                            onTap: () => Navigator.of(context).push(
                                MaterialPageRoute<void>(
                                    builder: (_) => MenuPedidosPage(
                                        api: api,
                                        evento: widget.eventoId,
                                        establecimiento: local))),
                          )))),
        ]),
      );
}

String importePedido(dynamic valor, [String moneda = 'COP']) {
  final partes = valor.toString().split('.');
  final entero = partes.first
      .replaceAllMapped(RegExp(r'(\d)(?=(\d{3})+(?!\d))'), (m) => '${m[1]}.');
  final centavos = partes.length > 1 ? partes[1].padRight(2, '0') : '00';
  return '\$$entero,$centavos $moneda';
}

class MenuPedidosPage extends StatefulWidget {
  const MenuPedidosPage(
      {super.key,
      required this.api,
      required this.evento,
      required this.establecimiento});
  final PedidosApi api;
  final String evento;
  final DatosPedido establecimiento;
  @override
  State<MenuPedidosPage> createState() => _MenuPedidosPageState();
}

class _MenuPedidosPageState extends State<MenuPedidosPage> {
  late final CompraPedido compra;
  late Future<List<DatosPedido>> productos;
  @override
  void initState() {
    super.initState();
    compra = CompraPedido(
        widget.api, widget.evento, widget.establecimiento['id'] as String);
    productos = widget.api.productos(compra.establecimiento);
    compra.addListener(_cambio);
  }

  void _cambio() {
    if (mounted) setState(() {});
  }

  @override
  void dispose() {
    compra.removeListener(_cambio);
    compra.dispose();
    super.dispose();
  }

  Widget _panel(List<Widget> hijos) => Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: LiquidGlassCard(
          child: Material(
              type: MaterialType.transparency,
              child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: hijos))));

  @override
  Widget build(BuildContext context) {
    final titulo = Theme.of(context).textTheme.titleLarge;
    final pedido = compra.pedido;
    final pago = compra.pago;
    return GlassScaffold(
      appBar:
          GlassAppBar(title: Text(widget.establecimiento['nombre'] as String)),
      body: Padding(
          padding: EdgeInsets.only(
              top: kToolbarHeight + MediaQuery.paddingOf(context).top),
          child: ListView(padding: const EdgeInsets.all(16), children: [
            Text(widget.establecimiento['puntoEntrega'] as String),
            const SizedBox(height: 16),
            if (compra.mensaje != null)
              _panel([Text(compra.mensaje!, semanticsLabel: compra.mensaje)]),
            if (compra.confirmado)
              _panel([
                const Icon(Icons.check_circle,
                    color: Color(0xFF34D399), size: 48),
                Text('¡Compra confirmada!',
                    style: titulo, textAlign: TextAlign.center),
                const Text('Pago aprobado', textAlign: TextAlign.center),
                const SizedBox(height: 16),
                Text(importePedido(pago!['monto'], pago['moneda'] as String),
                    style: titulo, textAlign: TextAlign.center),
                if (pago['codigoQr'] is String)
                  Center(
                      child: Semantics(
                          label: 'QR del pedido confirmado',
                          child: QrImageView(
                              data: pago['codigoQr'] as String,
                              size: 240,
                              padding: const EdgeInsets.all(16),
                              backgroundColor: Colors.white))),
                const Text(
                    'Conserva este QR para recoger tu pedido. Guarda una captura antes de salir.'),
              ])
            else if (pedido != null)
              _panel([
                Text('Revisa tu pedido', style: titulo),
                const Text('Pendiente de pago'),
                for (final detalle in pedido['detalles'] as List)
                  ListTile(
                      contentPadding: EdgeInsets.zero,
                      title: Text(
                          '${detalle['cantidad']} × ${detalle['nombreProducto']}'),
                      subtitle: Text(
                          '${importePedido(detalle['precioUnitario'], pedido['moneda'] as String)} por unidad')),
                Text(
                    'Total: ${importePedido(pedido['total'], pedido['moneda'] as String)}',
                    style: titulo),
                const SizedBox(height: 12),
                const Text('Recoger en el establecimiento'),
                Text(
                    'Reserva hasta ${MaterialLocalizations.of(context).formatTimeOfDay(TimeOfDay.fromDateTime(DateTime.parse(pedido['expiraEn'] as String).toLocal()))}'),
                const SizedBox(height: 16),
                FilledButton(
                    onPressed: compra.ocupado ? null : compra.pagar,
                    child: Text(compra.ocupado
                        ? 'Procesando…'
                        : compra.mensaje != null
                            ? 'Volver a intentar'
                            : 'Pagar pedido')),
                const Text(
                    'Pago de demostración. No necesitas datos de tarjeta.'),
              ])
            else
              FutureBuilder<List<DatosPedido>>(
                  future: productos,
                  builder: (context, snapshot) {
                    if (snapshot.connectionState != ConnectionState.done) {
                      return const Center(child: CircularProgressIndicator());
                    }
                    if (snapshot.hasError) {
                      return OutlinedButton(
                          onPressed: () => setState(() => productos =
                              widget.api.productos(compra.establecimiento)),
                          child: const Text('Volver a cargar el menú'));
                    }
                    return Column(
                        crossAxisAlignment: CrossAxisAlignment.stretch,
                        children: [
                          if (snapshot.data!.isEmpty)
                            const Text('No hay productos disponibles.'),
                          for (final producto in snapshot.data!)
                            _panel([
                              Text(producto['nombre'] as String, style: titulo),
                              if (producto['descripcion'] != null)
                                Text(producto['descripcion'] as String),
                              Text(importePedido(producto['precio'])),
                              if (producto['activo'] != true ||
                                  producto['cantidadInventario'] == 0)
                                const Text('Agotado')
                              else
                                Row(
                                    mainAxisAlignment: MainAxisAlignment.end,
                                    children: [
                                      IconButton(
                                          tooltip:
                                              'Quitar ${producto['nombre']}',
                                          onPressed: compra.ocupado ||
                                                  compra.incierto ||
                                                  (compra.cantidades[
                                                              producto['id']] ??
                                                          0) ==
                                                      0
                                              ? null
                                              : () => compra.cambiar(
                                                  producto['id'] as String, -1),
                                          icon: const Icon(Icons.remove)),
                                      Text(
                                          '${compra.cantidades[producto['id']] ?? 0}'),
                                      IconButton(
                                          tooltip:
                                              'Agregar ${producto['nombre']}',
                                          onPressed: compra.ocupado ||
                                                  compra.incierto
                                              ? null
                                              : () => compra.cambiar(
                                                  producto['id'] as String, 1),
                                          icon: const Icon(Icons.add)),
                                    ]),
                            ]),
                          _panel([
                            const ListTile(
                                contentPadding: EdgeInsets.zero,
                                leading: Icon(Icons.shopping_bag_outlined),
                                title: Text('Recoger en el establecimiento'),
                                subtitle:
                                    Text('Método de entrega seleccionado')),
                            const Text(
                                'Verás el total y confirmarás disponibilidad en el siguiente paso.'),
                            const SizedBox(height: 12),
                            FilledButton(
                                onPressed: compra.ocupado ||
                                        compra.incierto ||
                                        !compra.cantidades.values
                                            .any((n) => n > 0)
                                    ? null
                                    : compra.crear,
                                child: Text(compra.ocupado
                                    ? 'Preparando pedido…'
                                    : 'Continuar')),
                          ]),
                        ]);
                  }),
          ])),
    );
  }
}
