import '../widgets/entrega_pedido_panel.dart';
import 'package:flutter/material.dart';
import '../services/pedidos_api.dart';
import '../widgets/liquid_glass.dart';
import '../widgets/sondeo_pedidos.dart';
import 'pedidos_page.dart' show importePedido;

class RestaurantOrdersPage extends StatefulWidget {
  const RestaurantOrdersPage(
      {super.key,
      this.api,
      this.eventoId = 'e0000001-0000-4000-8000-000000000001'});
  final PedidosApi? api;
  final String
      eventoId; // Compatibilidad; la autorización usa el vínculo privado.
  @override
  State<RestaurantOrdersPage> createState() => _RestaurantOrdersPageState();
}

class _RestaurantOrdersPageState extends State<RestaurantOrdersPage> {
  late final api = widget.api ?? PedidosApi.instance;
  final desplazamiento = ScrollController();
  late final SondeoPedidos sondeo;
  List<DatosPedido> locales = [], pedidos = [];
  DatosPedido? detalle, pendiente;
  String? seleccionado, error, aviso;
  bool cargando = false, entregaOcupada = false, entregaPendiente = false;
  int pagina = 0;
  @override
  void initState() {
    super.initState();
    sondeo = SondeoPedidos(
        activo: () =>
            mounted &&
            (ModalRoute.of(context)?.isCurrent ?? true) &&
            TickerMode.valuesOf(context).enabled &&
            pendiente == null,
        ocupado: () => cargando || entregaOcupada,
        consultar: actualizar);
    cargarCatalogo();
  }

  @override
  void dispose() {
    sondeo.dispose();
    desplazamiento.dispose();
    super.dispose();
  }

  Future<void> cargarCatalogo() async {
    if (cargando) return;
    setState(() {
      cargando = true;
      error = null;
    });
    try {
      pendiente = await api.pendientePreparacion();
      if (!mounted) return;
      final resultado = await api.misEstablecimientos();
      if (!mounted) return;
      locales = resultado;
      final entrega = await api.pendienteEntrega();
      entregaPendiente = entrega != null;
      final sugerido =
          pendiente?['local'] as String? ?? entrega?['local'] as String?;
      seleccionado = resultado.any((e) => e['id'] == sugerido)
          ? sugerido
          : resultado.isEmpty
              ? null
              : resultado.first['id'] as String;
      if (seleccionado != null) await leer();
    } catch (e) {
      if (mounted) {
        error = e is PedidosException
            ? e.mensaje
            : seleccionado == null
                ? 'No se pudieron cargar los establecimientos.'
                : 'No pudimos consultar los pedidos. Vuelve a intentar.';
        sondeo.pausado = true;
      }
    } finally {
      if (mounted) setState(() => cargando = false);
    }
  }

  Future<void> leer() async {
    final local = seleccionado;
    if (local == null || !mounted) return;
    final lista = await api.recibidos(local, pagina: pagina);
    if (!mounted) return;
    pedidos = lista;
    if (detalle != null) {
      detalle = await api.detalleRecibido(local, detalle!['id'] as String);
    }
  }

  Future<void> actualizar() async {
    if (cargando) return;
    setState(() {
      cargando = true;
      error = null;
      sondeo.pausado = false;
    });
    try {
      await leer();
    } catch (e) {
      if (mounted) {
        error = e is PedidosException
            ? e.mensaje
            : 'No pudimos consultar los pedidos. Vuelve a intentar.';
        sondeo.pausado = true;
      }
    } finally {
      if (mounted) setState(() => cargando = false);
    }
  }

  Future<void> cargarPedidos(String local) async {
    seleccionado = local;
    pagina = 0;
    pedidos = [];
    detalle = null;
    await actualizar();
  }

  Future<void> cambiarPagina(int delta) async {
    if (cargando || pendiente != null || pagina + delta < 0) return;
    pagina += delta;
    pedidos = [];
    detalle = null;
    await actualizar();
  }

  Future<void> seleccionar(DatosPedido p) async {
    if (cargando || pendiente != null) return;
    setState(() {
      cargando = true;
      error = null;
    });
    try {
      detalle = await api.detalleRecibido(seleccionado!, p['id'] as String);
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (mounted && desplazamiento.hasClients) desplazamiento.jumpTo(0);
      });
    } catch (e) {
      error = e.toString();
      sondeo.pausado = true;
    } finally {
      if (mounted) setState(() => cargando = false);
    }
  }

  Future<void> ejecutar(DatosPedido datos, {bool repetir = false}) async {
    if (cargando || (!repetir && detalle == null)) return;
    setState(() {
      cargando = true;
      error = null;
      aviso = null;
    });
    try {
      if (repetir) {
        await api.repetirPreparacion(pendiente!);
      } else {
        await api.operarPreparacion(
            seleccionado!, detalle!['id'] as String, datos);
      }
      if (!mounted) return;
      pendiente = await api.pendientePreparacion();
      sondeo.pausado = false;
      aviso = 'Avance guardado. El cliente tiene un aviso en web/app.';
      await leer();
    } catch (e) {
      if (!mounted) return;
      error = e.toString();
      sondeo.pausado = true;
      pendiente = await api.pendientePreparacion();
      if (pendiente == null) {
        try {
          await leer();
        } catch (_) {/* Mantener error. */}
      } else {
        aviso =
            'Resultado sin confirmar. Repite la misma operación para resolverla.';
      }
    } finally {
      if (mounted) {
        setState(() => cargando = false);
        if (error != null) {
          WidgetsBinding.instance.addPostFrameCallback((_) {
            if (mounted && desplazamiento.hasClients) desplazamiento.jumpTo(0);
          });
        }
      }
    }
  }

  Future<void> formulario(String accion, {String? incidencia}) async {
    final p = detalle;
    if (p == null) return;
    final version = (p['preparacion'] as Map)['version'];
    final minutos =
        TextEditingController(text: accion == 'INICIAR' ? '10' : '5');
    final motivo = TextEditingController();
    final form = GlobalKey<FormState>();
    final ruta = DialogRoute<DatosPedido>(
        context: context,
        builder: (context) => AlertDialog(
                title: Text(accion == 'INICIAR'
                    ? 'Iniciar preparación'
                    : accion == 'RETRASAR'
                        ? 'Registrar retraso'
                        : accion == 'INCIDENCIA'
                            ? 'Reportar incidencia'
                            : 'Resolver incidencia'),
                content: SingleChildScrollView(
                    child: Form(
                        key: form,
                        child:
                            Column(mainAxisSize: MainAxisSize.min, children: [
                          if (accion == 'INICIAR' || accion == 'RETRASAR')
                            TextFormField(
                                controller: minutos,
                                decoration: InputDecoration(
                                    labelText: accion == 'INICIAR'
                                        ? 'Minutos estimados'
                                        : 'Minutos adicionales'),
                                keyboardType: TextInputType.number,
                                validator: (v) {
                                  final n = int.tryParse(v ?? '');
                                  return n == null || n < 1 || n > 240
                                      ? 'Indica un entero entre 1 y 240.'
                                      : null;
                                }),
                          if (accion != 'INICIAR')
                            TextFormField(
                                controller: motivo,
                                decoration: const InputDecoration(
                                    labelText: 'Motivo o resolución'),
                                minLines: 2,
                                maxLines: 4,
                                maxLength: 1000,
                                validator: (v) => (v?.trim().length ?? 0) < 3
                                    ? 'Describe el motivo o resolución.'
                                    : null),
                        ]))),
                actions: [
                  TextButton(
                      onPressed: () => Navigator.pop(context),
                      child: const Text('Cancelar')),
                  FilledButton(
                      onPressed: () {
                        if (form.currentState!.validate()) {
                          Navigator.pop(context, <String, dynamic>{
                            'accion': accion,
                            'version': version,
                            if (accion == 'INICIAR' || accion == 'RETRASAR')
                              'minutos': int.parse(minutos.text),
                            if (accion != 'INICIAR')
                              'motivo': motivo.text.trim(),
                            if (incidencia != null) 'incidenciaId': incidencia
                          });
                        }
                      },
                      child: const Text('Guardar avance'))
                ]));
    final datos = await Navigator.of(context).push(ruta);
    await ruta.completed;
    minutos.dispose();
    motivo.dispose();
    if (datos != null && mounted) await ejecutar(datos);
  }

  Widget panel(List<Widget> contenido) => Padding(
      padding: const EdgeInsets.only(bottom: 16),
      child: LiquidGlassCard(
          child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: contenido)));
  @override
  Widget build(BuildContext context) => RefreshIndicator(
      onRefresh: seleccionado == null ? cargarCatalogo : actualizar,
      child: ListView(
          controller: desplazamiento,
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.all(16),
          children: [
            Text('Pedidos recibidos',
                style: Theme.of(context).textTheme.headlineSmall),
            const Text(
                'Prepara el pedido, valida el código del cliente y confirma su entrega.'),
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
                  onChanged: cargando ||
                          pendiente != null ||
                          entregaOcupada ||
                          entregaPendiente
                      ? null
                      : (v) {
                          if (v != null) cargarPedidos(v);
                        }),
            TextButton(
                onPressed: cargando
                    ? null
                    : seleccionado == null
                        ? cargarCatalogo
                        : actualizar,
                child: const Text('Actualizar pedidos')),
            Text('Página ${pagina + 1}'),
            Wrap(children: [
              TextButton(
                  onPressed: cargando || pendiente != null || pagina == 0
                      ? null
                      : () => cambiarPagina(-1),
                  child: const Text('Pedidos más recientes')),
              TextButton(
                  onPressed:
                      cargando || pendiente != null || pedidos.length < 100
                          ? null
                          : () => cambiarPagina(1),
                  child: const Text('Pedidos anteriores')),
            ]),
            if (cargando) const LinearProgressIndicator(),
            if (error != null) ...[
              Text(error!, key: const Key('error-preparacion')),
              OutlinedButton(
                  onPressed: cargando
                      ? null
                      : seleccionado == null
                          ? cargarCatalogo
                          : actualizar,
                  child: const Text('Reintentar'))
            ],
            if (sondeo.pausado) const Text('Actualización automática pausada.'),
            if (aviso != null) Text(aviso!),
            if (pendiente != null)
              FilledButton(
                  onPressed:
                      cargando ? null : () => ejecutar({}, repetir: true),
                  child: const Text('Repetir operación pendiente')),
            if (!cargando && locales.isEmpty)
              const Text('No hay establecimientos vinculados a tu cuenta.'),
            if (!cargando && locales.isNotEmpty && pedidos.isEmpty)
              Text(pagina == 0
                  ? 'Aún no hay pedidos confirmados en este establecimiento.'
                  : 'No hay pedidos en esta página.'),
            if (seleccionado != null)
              ExpansionTile(
                  title: const Text('Validar y entregar'),
                  initiallyExpanded: entregaPendiente,
                  children: [
                    EntregaPedidoPanel(
                        api: api,
                        local: seleccionado!,
                        inactivo: cargando || pendiente != null,
                        alEntregar: actualizar,
                        alOcupar: (v) {
                          if (mounted) setState(() => entregaOcupada = v);
                        },
                        alPendiente: (v) {
                          if (mounted) setState(() => entregaPendiente = v);
                        })
                  ]),
            if (detalle != null) ...detalleWidgets(detalle!),
            for (final p in pedidos)
              panel([
                Text(p['estado'] == 'CONFIRMADO'
                    ? 'Pedido confirmado'
                    : p['estado'].toString()),
                Text(avancePedido(p['estadoOperativo'] as String? ??
                    (p['preparacion'] as Map?)?['estado'] as String?)),
                for (final d in p['productos'] as List)
                  Text('${d['cantidad']} × ${d['nombreProducto']}'),
                Text(importePedido(p['total'], p['moneda'] as String)),
                TextButton(
                    onPressed: cargando || pendiente != null
                        ? null
                        : () => seleccionar(p),
                    child: const Text('Gestionar pedido')),
              ]),
          ]));
  List<Widget> detalleWidgets(DatosPedido p) {
    final a = p['preparacion'] as Map;
    final habilitado =
        p['estado'] == 'CONFIRMADO' && p['pagoVerificado'] == true;
    return [
      panel([
        Text('Pedido ${p['id']}'),
        for (final d in p['productos'] as List)
          Text('${d['cantidad']} × ${d['nombreProducto']}'),
        Text(
            avancePedido(
                p['estadoOperativo'] as String? ?? a['estado'] as String?),
            style: Theme.of(context).textTheme.titleLarge),
        if (a['estimadoListoEn'] != null)
          Text('Estimado listo: ${fechaPedido(a['estimadoListoEn'])}'),
        if (a['retrasado'] == true)
          const Text('La estimación se ha superado; registra el nuevo tiempo.'),
        if (!habilitado)
          const Text('Solo se preparan pedidos confirmados con pago aprobado.'),
        if (habilitado && a['estado'] == 'RECIBIDO')
          FilledButton(
              onPressed: cargando || pendiente != null
                  ? null
                  : () => formulario('INICIAR'),
              child: const Text('Iniciar preparación')),
        if (habilitado && a['estado'] == 'EN_PREPARACION') ...[
          TextButton(
              onPressed: cargando || pendiente != null
                  ? null
                  : () => formulario('RETRASAR'),
              child: const Text('Registrar retraso')),
          TextButton(
              onPressed: cargando || pendiente != null
                  ? null
                  : () => formulario('INCIDENCIA'),
              child: const Text('Reportar incidencia')),
          FilledButton(
              onPressed: cargando ||
                      pendiente != null ||
                      a['incidenciasAbiertas'] != 0
                  ? null
                  : () =>
                      ejecutar({'accion': 'LISTO', 'version': a['version']}),
              child: const Text('Marcar listo')),
        ],
        if (p['entrega'] case final Map entrega)
          Text(
              'Entregado en ${entrega['puntoEntrega']} · ${fechaPedido(entrega['entregadoEn'])}. El QR ya no permite otra entrega.')
        else if (a['estado'] == 'LISTO_PARA_ENTREGAR')
          const Text(
              'Preparación finalizada. Valida el código del cliente para entregar.'),
        for (final i in p['incidencias'] as List? ?? []) ...[
          Text(
              '${i['descripcion']} · ${i['resueltaEn'] == null ? 'Pendiente de resolver' : 'Resuelta: ${i['resolucion']}'}'),
          if (habilitado &&
              i['resueltaEn'] == null &&
              a['estado'] == 'EN_PREPARACION')
            TextButton(
                onPressed: cargando || pendiente != null
                    ? null
                    : () => formulario('RESOLVER_INCIDENCIA',
                        incidencia: i['id'] as String),
                child: const Text('Resolver incidencia'))
        ],
        const Text(
            'Una incidencia no cambia productos, importes ni pagos. No cancela ni reembolsa.'),
        const Text('Historial y avisos'),
        for (final h in p['historial'] as List? ?? [])
          Text(
              '${h['accion']} · ${fechaPedido(h['creadoEn'])} · actor ${h['actorId']}'),
        for (final h in p['avisos'] as List? ?? [])
          Text(h['mensaje'] as String),
      ])
    ];
  }
}
