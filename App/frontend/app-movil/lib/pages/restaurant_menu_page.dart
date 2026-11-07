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
  List<DatosPedido> locales = [], productos = [], operaciones = [];
  DatosPedido? pendiente;
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
    });
    try {
      final vinculados = await api.misEstablecimientos();
      if (!mounted) return;
      locales = vinculados;
      if (!locales.any((e) => e['id'] == seleccionado)) {
        seleccionado = locales.isEmpty ? null : locales.first['id'] as String;
      }
      pendiente = await api.pendienteMenu();
      final lista = seleccionado == null
          ? <DatosPedido>[]
          : await api.menu(seleccionado!);
      if (!mounted) return;
      final historial = seleccionado == null
          ? <DatosPedido>[]
          : await api.historialInventario(seleccionado!);
      if (!mounted) return;
      setState(() {
        productos = lista;
        operaciones = historial;
      });
    } catch (_) {
      if (mounted) {
        setState(() => error = 'No pudimos cargar el menú. Vuelve a intentar.');
      }
    } finally {
      if (mounted) setState(() => cargando = false);
    }
  }

  Future<void> editar([DatosPedido? producto]) async {
    final datos = await showDialog<DatosPedido>(
        context: context,
        builder: (_) => FormularioProductoMenu(producto: producto));
    if (datos == null || !mounted) return;
    await operar(() async {
      if (producto == null) return api.operarMenu(seleccionado!, datos);
      await api.editarProducto(seleccionado!, producto['id'] as String, datos);
      return {'estado': 'APLICADA'};
    });
  }

  Future<void> ajustar(DatosPedido producto) async {
    final datos = await showDialog<DatosPedido>(
        context: context, builder: (_) => const FormularioAjusteMenu());
    if (datos == null || !mounted) return;
    await operar(() => api.operarMenu(seleccionado!, datos,
        producto: producto['id'] as String));
  }

  Future<void> operar(Future<DatosPedido> Function() ejecutar) async {
    if (guardando || cargando) return;
    setState(() {
      guardando = true;
      aviso = null;
    });
    try {
      final op = await ejecutar();
      if (!mounted) return;
      setState(() => aviso = op['estado'] == 'RECHAZADA'
          ? 'Ajuste rechazado: no puede retirar unidades comprometidas ni superar los límites físicos.'
          : op['estado'] == 'PENDIENTE'
              ? 'Operación ${op['id']} pendiente de confirmar.'
              : 'Menú e inventario actualizados.');
    } catch (e) {
      if (mounted) {
        setState(() =>
            aviso = '$e La intención se conserva si el resultado es incierto.');
      }
    } finally {
      if (mounted) setState(() => guardando = false);
    }
    if (mounted) await cargar();
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
                      'Administra productos y existencias de tus establecimientos vinculados, incluidos los cerrados al público.')),
              if (pendiente != null) ...[
                Text('Operación ${pendiente!['id']} sin confirmar.'),
                OutlinedButton(
                    onPressed: guardando || cargando
                        ? null
                        : () => operar(() => api.repetirMenu(pendiente!)),
                    child: const Text('Repetir operación pendiente')),
              ],
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
                    onChanged: cargando || guardando || pendiente != null
                        ? null
                        : (valor) {
                            if (valor != null) {
                              seleccionado = valor;
                              cargar();
                            }
                          }),
              const SizedBox(height: 16),
              if (seleccionado != null)
                FilledButton.icon(
                    onPressed: guardando || cargando || pendiente != null
                        ? null
                        : () => editar(),
                    icon: const Icon(Icons.add),
                    label: const Text('Nuevo producto')),
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
                    'No tienes establecimientos vinculados. Solicita la asignación al organizador.')
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
                            Text((producto['restriccionesAlimentarias']
                                        as List? ??
                                    [])
                                .join(', ')),
                            Text(
                                'Físico: ${producto['cantidadFisica'] ?? producto['cantidadInventario'] ?? '?'} · Reservado: ${producto['cantidadReservada'] ?? '?'} · Disponible: ${producto['cantidadDisponible'] ?? 'Por confirmar'}'),
                            Wrap(children: [
                              TextButton(
                                  onPressed: guardando || pendiente != null
                                      ? null
                                      : () => editar(producto),
                                  child: const Text('Editar producto')),
                              TextButton(
                                  onPressed: guardando || pendiente != null
                                      ? null
                                      : () => ajustar(producto),
                                  child: const Text('Ajustar existencias')),
                            ]),
                            Row(children: [
                              Expanded(
                                  child: Text(producto['activo'] == true
                                      ? 'Disponible para venta'
                                      : 'No disponible para venta')),
                              Switch(
                                  value: producto['activo'] == true,
                                  onChanged: guardando || pendiente != null
                                      ? null
                                      : (valor) => cambiar(producto, valor)),
                            ]),
                          ]))),
              if (operaciones.isNotEmpty)
                ExpansionTile(
                    title: const Text('Trazabilidad de inventario'),
                    children: [
                      for (final op in operaciones)
                        ListTile(
                            title: Text(
                                '${op['motivo']} · ${op['delta']} · ${op['estado']}'),
                            subtitle: Text('${op['id']}')),
                    ]),
            ]),
      );
}

class FormularioProductoMenu extends StatefulWidget {
  const FormularioProductoMenu({super.key, this.producto});
  final DatosPedido? producto;
  @override
  State<FormularioProductoMenu> createState() => _FormularioProductoMenuState();
}

class _FormularioProductoMenuState extends State<FormularioProductoMenu> {
  final form = GlobalKey<FormState>();
  late final nombre =
      TextEditingController(text: widget.producto?['nombre'] as String? ?? '');
  late final descripcion = TextEditingController(
      text: widget.producto?['descripcion'] as String? ?? '');
  late final precio =
      TextEditingController(text: widget.producto?['precio'] as String? ?? '');
  late final restricciones = TextEditingController(
      text: (widget.producto?['restriccionesAlimentarias'] as List? ?? [])
          .join(', '));
  final inicial = TextEditingController(text: '0');
  late bool activo = widget.producto?['activo'] as bool? ?? true;
  @override
  void dispose() {
    for (final c in [nombre, descripcion, precio, restricciones, inicial]) {
      c.dispose();
    }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AlertDialog(
          title: Text(widget.producto == null
              ? 'Registrar producto'
              : 'Editar producto'),
          content: SizedBox(
              width: 460,
              child: SingleChildScrollView(
                  child: Form(
                      key: form,
                      child: Column(mainAxisSize: MainAxisSize.min, children: [
                        TextFormField(
                            controller: nombre,
                            decoration: const InputDecoration(
                                labelText: 'Nombre del producto'),
                            maxLength: 200,
                            validator: (v) => (v?.trim().length ?? 0) < 2
                                ? 'Completa el nombre.'
                                : null),
                        TextFormField(
                            controller: descripcion,
                            decoration:
                                const InputDecoration(labelText: 'Descripción'),
                            maxLength: 5000,
                            maxLines: 2),
                        TextFormField(
                            controller: precio,
                            decoration:
                                const InputDecoration(labelText: 'Precio COP'),
                            keyboardType: const TextInputType.numberWithOptions(
                                decimal: true),
                            validator: (v) => v != null &&
                                    RegExp(r'^(0|[1-9]\d{0,9})(\.\d{1,2})?$')
                                        .hasMatch(v) &&
                                    !RegExp(r'^0(\.0{1,2})?$').hasMatch(v)
                                ? null
                                : 'Precio decimal positivo, máximo dos decimales.'),
                        TextFormField(
                            controller: restricciones,
                            decoration: const InputDecoration(
                                labelText: 'Restricciones alimentarias',
                                helperText: 'Separadas por coma')),
                        if (widget.producto == null)
                          TextFormField(
                              controller: inicial,
                              decoration: const InputDecoration(
                                  labelText: 'Existencias físicas iniciales'),
                              keyboardType: TextInputType.number,
                              validator: (v) {
                                final n = int.tryParse(v ?? '');
                                return n == null || n < 0 || n > 2147483647
                                    ? 'Cantidad entera entre 0 y 2147483647.'
                                    : null;
                              }),
                        SwitchListTile(
                            title: const Text('Activo para nuevos pedidos'),
                            value: activo,
                            onChanged: (v) => setState(() => activo = v)),
                      ])))),
          actions: [
            TextButton(
                onPressed: () => Navigator.pop(context),
                child: const Text('Cancelar')),
            FilledButton(
                onPressed: () {
                  if (!form.currentState!.validate()) return;
                  Navigator.pop(context, <String, dynamic>{
                    'nombre': nombre.text.trim(),
                    'descripcion': descripcion.text.trim(),
                    'precio': precio.text.trim(),
                    'restriccionesAlimentarias': restricciones.text
                        .split(',')
                        .map((e) => e.trim())
                        .where((e) => e.isNotEmpty)
                        .toList(),
                    'activo': activo,
                    if (widget.producto == null)
                      'cantidadInicial': int.parse(inicial.text),
                  });
                },
                child: const Text('Guardar producto'))
          ]);
}

class FormularioAjusteMenu extends StatefulWidget {
  const FormularioAjusteMenu({super.key});
  @override
  State<FormularioAjusteMenu> createState() => _FormularioAjusteMenuState();
}

class _FormularioAjusteMenuState extends State<FormularioAjusteMenu> {
  final form = GlobalKey<FormState>(),
      delta = TextEditingController(),
      motivo = TextEditingController();
  @override
  void dispose() {
    delta.dispose();
    motivo.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => AlertDialog(
          title: const Text('Ajustar existencias'),
          content: Form(
              key: form,
              child: Column(mainAxisSize: MainAxisSize.min, children: [
                const Text(
                    'Unidades positivas añaden; negativas retiran. No se pueden retirar cantidades comprometidas.'),
                TextFormField(
                    controller: delta,
                    decoration: const InputDecoration(
                        labelText: 'Variación de existencias'),
                    keyboardType:
                        const TextInputType.numberWithOptions(signed: true),
                    validator: (v) {
                      final n = int.tryParse(v ?? '');
                      return n == null || n == 0 || n.abs() > 2147483647
                          ? 'Indica un entero distinto de cero dentro del límite.'
                          : null;
                    }),
                TextFormField(
                    controller: motivo,
                    decoration:
                        const InputDecoration(labelText: 'Motivo del ajuste'),
                    maxLength: 500,
                    validator: (v) => (v?.trim().length ?? 0) < 3
                        ? 'Completa el motivo.'
                        : null),
              ])),
          actions: [
            TextButton(
                onPressed: () => Navigator.pop(context),
                child: const Text('Cancelar')),
            FilledButton(
                onPressed: () {
                  if (form.currentState!.validate()) {
                    Navigator.pop(context, <String, dynamic>{
                      'delta': int.parse(delta.text),
                      'motivo': motivo.text.trim()
                    });
                  }
                },
                child: const Text('Aplicar ajuste'))
          ]);
}
