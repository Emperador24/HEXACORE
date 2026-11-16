import '../widgets/cancelacion_pedido_panel.dart' show resumenCancelacion;
import 'package:flutter/material.dart';
import 'package:qr_flutter/qr_flutter.dart';
import '../services/pedidos_api.dart';
import '../widgets/sondeo_pedidos.dart';
import '../widgets/liquid_glass.dart';

class MisPedidosPage extends StatefulWidget {
  const MisPedidosPage(
      {super.key, this.api, this.pedidoId, this.paginaCompleta = false});
  final PedidosApi? api;
  final String? pedidoId;
  final bool paginaCompleta;
  @override
  State<MisPedidosPage> createState() => _MisPedidosPageState();
}

class _MisPedidosPageState extends State<MisPedidosPage> {
  late final api = widget.api ?? PedidosApi.instance;
  late final SondeoPedidos sondeo;
  List<DatosPedido> pedidos = [];
  DatosPedido? detalle;
  String? id, error;
  bool cargando = false;
  int pagina = 0;
  @override
  void initState() {
    super.initState();
    id = widget.pedidoId;
    sondeo = SondeoPedidos(
        activo: () =>
            mounted &&
            (ModalRoute.of(context)?.isCurrent ?? true) &&
            TickerMode.valuesOf(context).enabled,
        ocupado: () => cargando,
        consultar: actualizar);
    actualizar();
  }

  @override
  void dispose() {
    sondeo.dispose();
    super.dispose();
  }

  Future<void> actualizar() async {
    if (cargando) return;
    setState(() {
      cargando = true;
      error = null;
      sondeo.pausado = false;
    });
    try {
      final lista = await api.misPedidos(pagina: pagina);
      if (!mounted) return;
      final d = id == null ? null : await api.seguimiento(id!);
      if (mounted) {
        setState(() {
          pedidos = lista;
          detalle = d;
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          error = e.toString();
          sondeo.pausado = true;
        });
      }
    } finally {
      if (mounted) setState(() => cargando = false);
    }
  }

  Future<void> cambiarPagina(int delta) async {
    if (cargando || pagina + delta < 0) return;
    pagina += delta;
    pedidos = [];
    await actualizar();
  }

  Widget panel(List<Widget> contenido) => Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: LiquidGlassCard(
          child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: contenido)));
  @override
  Widget build(BuildContext context) {
    final contenido = RefreshIndicator(
        onRefresh: actualizar,
        child: ListView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.all(16),
            children: [
              Text('Mis pedidos y avisos',
                  style: Theme.of(context).textTheme.headlineSmall),
              const Text(
                  'Canal dentro de la web/app. Consulta el estado vigente del pedido y su QR.'),
              TextButton(
                  onPressed: cargando ? null : actualizar,
                  child: const Text('Actualizar seguimiento')),
              Text('Página ${pagina + 1}'),
              Wrap(children: [
                TextButton(
                    onPressed: cargando || pagina == 0
                        ? null
                        : () => cambiarPagina(-1),
                    child: const Text('Pedidos más recientes')),
                TextButton(
                    onPressed: cargando || pedidos.length < 100
                        ? null
                        : () => cambiarPagina(1),
                    child: const Text('Pedidos anteriores')),
              ]),
              if (cargando) const LinearProgressIndicator(),
              if (error != null) Text(error!),
              if (sondeo.pausado)
                const Text(
                    'Actualización automática pausada. Usa Actualizar seguimiento.'),
              if (!cargando && pedidos.isEmpty)
                Text(pagina == 0
                    ? 'Aún no tienes pedidos.'
                    : 'No hay pedidos en esta página.'),
              if (detalle != null) ...detalleWidgets(detalle!),
              for (final p in pedidos)
                panel([
                  Text(p['establecimiento'] as String),
                  Text('${p['total']} ${p['moneda']} · ${p['estado']}'),
                  Text(avancePedido(p['estadoOperativo'] as String? ??
                      (p['preparacion'] as Map)['estado'] as String?)),
                  TextButton(
                      onPressed: cargando
                          ? null
                          : () => Navigator.of(context).push(
                              MaterialPageRoute<void>(
                                  builder: (_) => MisPedidosPage(
                                      api: api,
                                      pedidoId: p['id'] as String,
                                      paginaCompleta: true))),
                      child: const Text('Ver seguimiento')),
                ]),
            ]));
    return widget.paginaCompleta
        ? GlassScaffold(
            appBar: const GlassAppBar(title: Text('Mis pedidos y avisos')),
            body: Padding(
                padding: EdgeInsets.only(
                    top: kToolbarHeight + MediaQuery.paddingOf(context).top),
                child: contenido))
        : contenido;
  }

  List<Widget> detalleWidgets(DatosPedido p) {
    final a = p['preparacion'] as Map;
    return [
      panel([
        Text(p['establecimiento'] as String),
        Text(
            avancePedido(
                p['estadoOperativo'] as String? ?? a['estado'] as String?),
            style: Theme.of(context).textTheme.titleLarge),
        Text('${p['estado']} · Total acordado ${p['total']} ${p['moneda']}'),
        if (a['estimadoListoEn'] != null)
          Text('Estimado listo: ${fechaPedido(a['estimadoListoEn'])}'),
        if (a['retrasado'] == true)
          const Text(
              'La estimación se ha superado. El establecimiento debe actualizarla.'),
        for (final d in p['productos'] as List) ...[
          Text(
              '${d['cantidad']} × ${d['nombreProducto']} · ${d['precioUnitario']} ${p['moneda']}'),
          if (d['descripcionProducto'] != null)
            Text(d['descripcionProducto'] as String)
        ],
        if (p['codigoQr'] is String && p['qrUtilizable'] != false) ...[
          Center(
              child: Semantics(
                  label: 'QR del pedido confirmado',
                  child: QrImageView(
                      data: p['codigoQr'] as String,
                      size: 240,
                      backgroundColor: Colors.white))),
          Text('Punto de entrega: ${p['puntoEntrega']}')
        ] else if (p['entrega'] == null)
          const Text('El QR requiere un pedido confirmado con pago aprobado.'),
        if (p['entrega'] case final Map entrega)
          Text(
              'Entregado el ${fechaPedido(entrega['entregadoEn'])} en ${entrega['puntoEntrega']}. El QR ya no permite otra entrega.')
        else if (p['estado'] == 'CONFIRMADO' &&
            a['estado'] == 'LISTO_PARA_ENTREGAR')
          const Text(
              'Presenta tu QR en el punto autorizado para recibir el pedido.'),
        if (p['cancelacion'] case final Map c) ...resumenCancelacion(c),
        const Text('Avisos del establecimiento'),
        for (final aviso in p['avisos'] as List? ?? [])
          Text('${fechaPedido(aviso['creadoEn'])} · ${aviso['mensaje']}'),
        if ((p['avisos'] as List? ?? []).isEmpty)
          const Text('Aún no hay avisos de preparación.'),
        for (final i in p['incidencias'] as List? ?? [])
          Text(
              '${i['descripcion']} · ${i['resueltaEn'] == null ? 'Pendiente de resolver' : 'Resuelta: ${i['resolucion']}'}'),
      ])
    ];
  }
}
