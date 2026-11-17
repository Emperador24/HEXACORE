import 'dart:async';

import 'package:flutter/material.dart';
import 'package:qr_flutter/qr_flutter.dart';

import '../models/activity_log.dart';
import '../services/boleteria_api.dart';
import '../widgets/liquid_glass.dart';

/// Los caminos de la pasarela simulada, para poder demostrar cada uno.
const _tokensDemo = {'tok_ok_movil': 'Pago aprobado', 'tok_rechazo_movil': 'Pago rechazado (CU-001C)'};
const _metodos = {'TARJETA': 'Tarjeta de crédito o débito', 'PSE': 'PSE'};

const _estadosCompra = {
  'PENDIENTE': 'Pendiente de pago',
  'PAGANDO': 'Pago en proceso',
  'PAGADA': 'Pagada',
  'EXPIRADA': 'Vencida',
  'CANCELADA': 'Cancelada',
  'PARCIALMENTE_CANCELADA': 'Cancelada en parte',
};
const _estadosEntrada = {'VALIDA': 'Válida', 'EN_REVENTA': 'En reventa', 'USADA': 'Usada', 'ANULADA': 'Anulada'};

String pesos(num valor) {
  final texto = valor.round().toString();
  final conPuntos = texto.replaceAllMapped(RegExp(r'\B(?=(\d{3})+(?!\d))'), (_) => '.');
  return '\$$conPuntos';
}

String fechaCorta(DateTime fecha) {
  const meses = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  final h = fecha.hour.toString().padLeft(2, '0'), m = fecha.minute.toString().padLeft(2, '0');
  return '${fecha.day} ${meses[fecha.month - 1]} ${fecha.year} · $h:$m';
}

/// CU-001 y CU-004 desde la app del cliente, contra Boletería (RNF-14: mismo
/// contrato que el portal web).
///
/// Los pasos que ve la persona son los del RNF-12 (≤ 5 desde el evento hasta
/// la confirmación): 1) elegir localidad y cantidad, 2) continuar al pago
/// (pasa por la Cola virtual y aparta el cupo), 3) opcionalmente aplicar un
/// código, 4) confirmar el pago, 5) ver las entradas con su QR. Precio,
/// descuento y total los calcula el servidor.
class CompraEntradasPage extends StatefulWidget {
  const CompraEntradasPage({super.key, required this.eventoId, required this.nombre, this.api});
  final String eventoId;
  final String nombre;
  final BoleteriaApi? api;
  @override
  State<CompraEntradasPage> createState() => _CompraEntradasPageState();
}

class _CompraEntradasPageState extends State<CompraEntradasPage> {
  late final BoleteriaApi _api = widget.api ?? boleteriaApi;
  final _cupon = TextEditingController();
  EventoDetalle? _detalle;
  String? _localidadId;
  int _cantidad = 1;
  Map<String, dynamic>? _compra;
  String _metodo = 'TARJETA';
  String _token = _tokensDemo.keys.first;
  String? _error;
  String? _errorCupon;
  int? _posicionFila;
  bool _cargando = true;
  bool _reservando = false;
  Timer? _reloj;

  @override
  void initState() {
    super.initState();
    _cargar();
    _reloj = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted && _compra?['estado'] == 'PENDIENTE') setState(() {});
    });
  }

  @override
  void dispose() {
    _reloj?.cancel();
    _cupon.dispose();
    super.dispose();
  }

  Future<void> _cargar() async {
    setState(() {
      _cargando = true;
      _error = null;
    });
    try {
      final d = await _api.detalleEvento(widget.eventoId);
      _detalle = d;
      final libre = d.localidades.where((l) => !l.agotada && l.disponibles > 0).firstOrNull;
      _localidadId = libre?.id;
      _cantidad = 1;
    } on BoleteriaApiException catch (e) {
      _error = e.mensaje;
    }
    if (mounted) setState(() => _cargando = false);
  }

  Localidad? get _localidad => _detalle?.localidades.where((l) => l.id == _localidadId).firstOrNull;
  int get _maximo => (_localidad?.disponibles ?? 1).clamp(1, 10);

  /// Paso 2: Cola virtual y reserva del cupo (CU-001A si no alcanza).
  Future<void> _reservar() async {
    final localidad = _localidad;
    if (localidad == null) return;
    setState(() {
      _reservando = true;
      _error = null;
      _posicionFila = null;
    });
    try {
      final compra = await _api.reservar(widget.eventoId, localidad.id, _cantidad,
          enEspera: (p) => mounted ? setState(() => _posicionFila = p) : null);
      if (mounted) setState(() => _compra = compra);
    } on BoleteriaApiException catch (e) {
      if (mounted) setState(() => _error = e.mensaje);
      if (e.codigo == 'CU-001A') await _cargar();
    } finally {
      if (mounted) setState(() => _reservando = false);
    }
  }

  /// CU-004: el servidor valida el código y recalcula el total.
  Future<void> _aplicarCupon() async {
    final compra = _compra;
    if (compra == null || _cupon.text.trim().length < 3) return;
    setState(() => _errorCupon = null);
    try {
      final actualizada = await _api.aplicarCupon(compra['id'] as String, _cupon.text);
      if (mounted) setState(() => _compra = actualizada);
    } on BoleteriaApiException catch (e) {
      if (mounted) setState(() => _errorCupon = e.mensaje);
    }
  }

  Future<void> _quitarCupon() async {
    final compra = _compra;
    if (compra == null) return;
    try {
      final actualizada = await _api.quitarCupon(compra['id'] as String);
      if (mounted) {
        setState(() {
          _compra = actualizada;
          _cupon.clear();
          _errorCupon = null;
        });
      }
    } on BoleteriaApiException catch (e) {
      if (mounted) setState(() => _errorCupon = e.mensaje);
    }
  }

  /// Pasos 5-8: cobra y emite las entradas. Un rechazo (CU-001C) deja la reserva para reintentar.
  Future<void> _pagar() async {
    final compra = _compra;
    if (compra == null) return;
    setState(() => _error = null);
    try {
      final pagada = await _api.pagar(compra['id'] as String, metodoPago: _metodo, token: _token);
      activityLog.add(ActivityEntry(
        type: ActivityType.ticket,
        title: widget.nombre,
        subtitle: '${_localidad?.nombre ?? 'Entradas'} · Cantidad: ${pagada['cantidad']}',
        amount: (pagada['total'] as num).round(),
      ));
      if (mounted) setState(() => _compra = pagada);
    } on BoleteriaApiException catch (e) {
      if (!mounted) return;
      if (e.codigo == 'CU-001B') {
        // La reserva venció: se vuelve a elegir.
        setState(() {
          _compra = null;
          _error = e.mensaje;
        });
        await _cargar();
      } else {
        setState(() => _error = e.mensaje);
      }
    }
  }

  String _restante() {
    final expira = DateTime.tryParse(_compra?['expiraEn'] as String? ?? '');
    if (expira == null) return '';
    final s = expira.difference(DateTime.now()).inSeconds.clamp(0, 1 << 30);
    return '${s ~/ 60}:${(s % 60).toString().padLeft(2, '0')}';
  }

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    final scheme = Theme.of(context).colorScheme;
    final evento = _detalle?.evento;
    return GlassScaffold(
      appBar: const GlassAppBar(title: Text('Comprar entradas')),
      body: _cargando
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: _compra == null ? _cargar : () async {},
              child: ListView(
                padding: EdgeInsets.fromLTRB(16, kToolbarHeight + MediaQuery.of(context).padding.top + 20, 16, 24),
                children: [
                  Text(widget.nombre, style: textTheme.headlineSmall),
                  if (evento != null) ...[
                    const SizedBox(height: 4),
                    Text('${fechaCorta(evento.fechaInicio)} · ${evento.lugar}, ${evento.ciudad}',
                        style: textTheme.bodyMedium?.copyWith(color: scheme.onSurface.withValues(alpha: 0.65))),
                  ],
                  const SizedBox(height: 20),
                  if (_compra == null)
                    _elegir(textTheme, scheme)
                  else if (_compra!['estado'] == 'PAGADA')
                    _confirmacion(textTheme, scheme)
                  else
                    _pago(textTheme, scheme),
                ],
              ),
            ),
    );
  }

  Widget _mensajeError(ColorScheme scheme) => Padding(
        padding: const EdgeInsets.only(top: 10),
        child: Text(_error!, style: TextStyle(color: scheme.error)),
      );

  /// Paso 1: localidad y cantidad.
  Widget _elegir(TextTheme textTheme, ColorScheme scheme) {
    final d = _detalle;
    if (d == null) {
      return Text(_error ?? 'No se pudo cargar el evento.', style: TextStyle(color: scheme.error));
    }
    if (d.evento.pasado) return const Text('Este evento ya pasó: no tiene entradas a la venta.');
    final localidad = _localidad;
    return LiquidGlassCard(
      borderRadius: BorderRadius.circular(28),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Text('Elige tu localidad', style: textTheme.titleMedium),
        const SizedBox(height: 8),
        if (d.localidades.isEmpty) const Text('Este evento aún no tiene entradas a la venta.'),
        Material(
          type: MaterialType.transparency,
          child: RadioGroup<String>(
            groupValue: _localidadId,
            onChanged: (v) => setState(() {
              _localidadId = v;
              _cantidad = 1;
            }),
            child: Column(children: [
              for (final l in d.localidades)
                RadioListTile<String>(
                  contentPadding: EdgeInsets.zero,
                  value: l.id,
                  enabled: !l.agotada && l.disponibles > 0,
                  title: Text(l.nombre),
                  subtitle: Text(l.agotada || l.disponibles == 0 ? 'Agotada' : '${pesos(l.precio)} · ${l.disponibles} disponibles'),
                ),
            ]),
          ),
        ),
        const SizedBox(height: 8),
        Row(children: [
          Text('Cantidad', style: textTheme.bodyMedium),
          const Spacer(),
          IconButton(
            tooltip: 'Menos',
            onPressed: _cantidad > 1 ? () => setState(() => _cantidad--) : null,
            icon: const Icon(Icons.remove_circle_outline),
          ),
          Text('$_cantidad', style: textTheme.titleSmall),
          IconButton(
            tooltip: 'Más',
            onPressed: localidad != null && _cantidad < _maximo ? () => setState(() => _cantidad++) : null,
            icon: const Icon(Icons.add_circle_outline),
          ),
        ]),
        if (localidad != null) ...[
          const DashedDivider(),
          const SizedBox(height: 10),
          Row(children: [
            Text('Subtotal estimado', style: textTheme.bodyMedium),
            const Spacer(),
            Text(pesos(localidad.precio * _cantidad), style: textTheme.titleMedium),
          ]),
          Text('El total final lo confirma el servidor al apartar tus entradas.', style: textTheme.bodySmall),
        ],
        if (_posicionFila != null) ...[
          const SizedBox(height: 10),
          Text('Estás en la fila: puesto $_posicionFila. No cierres esta pantalla.',
              style: textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.w600)),
        ],
        if (_error != null) _mensajeError(scheme),
        const SizedBox(height: 16),
        FilledButton.icon(
          onPressed: localidad != null && !_reservando ? _reservar : null,
          icon: _reservando
              ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
              : const Icon(Icons.confirmation_number_outlined),
          label: const Text('Continuar al pago'),
        ),
      ]),
    );
  }

  /// Pasos 3-4: código promocional (opcional) y pago.
  Widget _pago(TextTheme textTheme, ColorScheme scheme) {
    final c = _compra!;
    final descuento = (c['descuento'] as num?) ?? 0;
    final codigo = c['codigoPromocional'] as String?;
    return LiquidGlassCard(
      borderRadius: BorderRadius.circular(28),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Text('Resumen de la compra', style: textTheme.titleMedium),
        const SizedBox(height: 8),
        Text('${_localidad?.nombre ?? 'Entradas'} × ${c['cantidad']} · ${pesos(c['precioUnitario'] as num)} c/u'),
        Text('Compra ${c['numeroCompra']}', style: textTheme.bodySmall),
        const SizedBox(height: 12),
        if (codigo == null)
          Row(children: [
            Expanded(
              child: TextField(
                controller: _cupon,
                textCapitalization: TextCapitalization.characters,
                decoration: const InputDecoration(labelText: 'Código promocional (opcional)'),
              ),
            ),
            const SizedBox(width: 8),
            OutlinedButton(onPressed: _aplicarCupon, child: const Text('Aplicar')),
          ])
        else
          Row(children: [
            Expanded(child: Text('$codigo aplicado · −${pesos(descuento)}', style: const TextStyle(color: Colors.green))),
            TextButton(onPressed: _quitarCupon, child: const Text('Quitar')),
          ]),
        if (_errorCupon != null)
          Padding(padding: const EdgeInsets.only(top: 4), child: Text(_errorCupon!, style: TextStyle(color: scheme.error))),
        const Divider(),
        Row(children: [
          Text('Subtotal', style: textTheme.bodyMedium),
          const Spacer(),
          Text(pesos(c['subtotal'] as num)),
        ]),
        if (descuento > 0)
          Row(children: [Text('Descuento', style: textTheme.bodyMedium), const Spacer(), Text('−${pesos(descuento)}')]),
        Row(children: [
          Text('Total', style: textTheme.titleMedium),
          const Spacer(),
          Text(pesos(c['total'] as num), style: textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700)),
        ]),
        const SizedBox(height: 4),
        Text('Tus entradas están apartadas. Paga antes de ${_restante()}.', style: textTheme.bodySmall),
        const SizedBox(height: 12),
        DropdownButtonFormField<String>(
          initialValue: _metodo,
          decoration: const InputDecoration(labelText: 'Método de pago'),
          items: [for (final m in _metodos.entries) DropdownMenuItem(value: m.key, child: Text(m.value))],
          onChanged: (v) => setState(() => _metodo = v!),
        ),
        const SizedBox(height: 8),
        Text('Resultado de la pasarela (demostración)', style: textTheme.bodySmall),
        Material(
          type: MaterialType.transparency,
          child: RadioGroup<String>(
            groupValue: _token,
            onChanged: (v) => setState(() => _token = v!),
            child: Column(children: [
              for (final t in _tokensDemo.entries)
                RadioListTile<String>(contentPadding: EdgeInsets.zero, dense: true, value: t.key, title: Text(t.value)),
            ]),
          ),
        ),
        if (_error != null) _mensajeError(scheme),
        const SizedBox(height: 12),
        LoadingFilledButton(label: 'Confirmar pago', onPressed: _pagar),
      ]),
    );
  }

  /// Paso 5: las entradas emitidas con su QR (CU-002: lo que se presenta en la puerta).
  Widget _confirmacion(TextTheme textTheme, ColorScheme scheme) {
    final c = _compra!;
    final entradas = ((c['entradas'] as List?) ?? []).cast<Map<String, dynamic>>();
    return Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
      LiquidGlassCard(
        borderRadius: BorderRadius.circular(28),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          const TintedIconBadge(icon: Icons.check_circle_outline, color: Colors.green, size: 48),
          const SizedBox(height: 12),
          Text('¡Compra confirmada!', style: textTheme.titleLarge),
          const SizedBox(height: 4),
          Text('Compra ${c['numeroCompra']} · ${pesos(c['total'] as num)}. Te enviamos la confirmación por correo.',
              style: textTheme.bodyMedium?.copyWith(color: scheme.onSurface.withValues(alpha: 0.7))),
        ]),
      ),
      const SizedBox(height: 12),
      for (final e in entradas) ...[TarjetaEntrada(entrada: e), const SizedBox(height: 12)],
      OutlinedButton.icon(
        onPressed: () => Navigator.of(context).pushReplacement(MaterialPageRoute(builder: (_) => MisEntradasPage(api: _api))),
        icon: const Icon(Icons.confirmation_number_outlined),
        label: const Text('Ver mis entradas'),
      ),
    ]);
  }
}

/// Una entrada con su QR, tal como se presenta en la puerta (CU-002).
class TarjetaEntrada extends StatelessWidget {
  const TarjetaEntrada({super.key, required this.entrada, this.onCancelar});
  final Map<String, dynamic> entrada;
  final VoidCallback? onCancelar;

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    final scheme = Theme.of(context).colorScheme;
    final estado = entrada['estado'] as String? ?? 'VALIDA';
    final qr = entrada['codigoQr'] as String?;
    final vigente = estado == 'VALIDA';
    return LiquidGlassCard(
      borderRadius: BorderRadius.circular(28),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Row(children: [
          Expanded(child: Text(entrada['localidadNombre'] as String? ?? 'Entrada', style: textTheme.titleSmall)),
          StatusChip(label: _estadosEntrada[estado] ?? estado, color: vigente ? Colors.green : scheme.outline),
        ]),
        Text('Ticket ${entrada['numeroTicket']}', style: textTheme.bodySmall),
        if (qr != null && vigente) ...[
          const SizedBox(height: 12),
          Center(
            child: Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(20)),
              child: QrImageView(data: qr, size: 170, semanticsLabel: 'Código QR de la entrada'),
            ),
          ),
          const SizedBox(height: 6),
          Center(child: SelectableText(qr, style: const TextStyle(fontFamily: 'monospace', fontWeight: FontWeight.w700))),
        ],
        if (onCancelar != null && vigente) ...[
          const SizedBox(height: 4),
          Align(alignment: Alignment.centerRight, child: TextButton(onPressed: onCancelar, child: const Text('Cancelar esta entrada'))),
        ],
      ]),
    );
  }
}

/// CU-002 y CU-003: las compras de la cuenta, sus entradas con QR y la
/// cancelación con reembolso. La política (cuánto se devuelve y qué se puede
/// cancelar) la decide el servidor en la cotización; aquí solo se muestra.
class MisEntradasPage extends StatefulWidget {
  const MisEntradasPage({super.key, this.api});
  final BoleteriaApi? api;
  @override
  State<MisEntradasPage> createState() => _MisEntradasPageState();
}

class _MisEntradasPageState extends State<MisEntradasPage> {
  late final BoleteriaApi _api = widget.api ?? boleteriaApi;
  List<Map<String, dynamic>> _compras = [];
  Map<String, String> _nombres = {};
  String? _error;
  bool _cargando = true;

  @override
  void initState() {
    super.initState();
    _cargar();
  }

  Future<void> _cargar() async {
    setState(() => _error = null);
    try {
      final r = await Future.wait([_api.misCompras(), _api.cartelera()]);
      _compras = (r[0] as List<Map<String, dynamic>>)
          .where((c) => c['estado'] == 'PAGADA' || c['estado'] == 'PARCIALMENTE_CANCELADA' || c['estado'] == 'CANCELADA')
          .toList();
      _nombres = {for (final e in r[1] as List<EventoResumen>) e.id: e.nombre};
    } on BoleteriaApiException catch (e) {
      _error = e.mensaje;
    }
    if (mounted) setState(() => _cargando = false);
  }

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    final scheme = Theme.of(context).colorScheme;
    return GlassScaffold(
      appBar: const GlassAppBar(title: Text('Mis entradas')),
      body: _cargando
          ? const Center(child: CircularProgressIndicator())
          : RefreshIndicator(
              onRefresh: _cargar,
              child: ListView(
                padding: EdgeInsets.fromLTRB(16, kToolbarHeight + MediaQuery.of(context).padding.top + 20, 16, 24),
                children: [
                  if (_error != null) Text(_error!, style: TextStyle(color: scheme.error)),
                  if (_error == null && _compras.isEmpty)
                    const Padding(padding: EdgeInsets.only(top: 32), child: Center(child: Text('Todavía no tienes entradas.'))),
                  for (final c in _compras) ...[
                    Card(
                      child: ListTile(
                        title: Text(_nombres[c['eventoId']] ?? 'Evento'),
                        subtitle: Text('Compra ${c['numeroCompra']} · ${c['cantidad']} entradas · ${pesos(c['total'] as num)}'),
                        trailing: StatusChip(
                          label: _estadosCompra[c['estado']] ?? c['estado'] as String,
                          color: c['estado'] == 'PAGADA' ? Colors.green : scheme.outline,
                        ),
                        onTap: () async {
                          await Navigator.of(context).push(MaterialPageRoute(
                              builder: (_) => DetalleCompraPage(
                                  compraId: c['id'] as String, nombreEvento: _nombres[c['eventoId']] ?? 'Evento', api: _api)));
                          await _cargar();
                        },
                      ),
                    ),
                    const SizedBox(height: 8),
                  ],
                  if (_compras.isNotEmpty)
                    Text('Toca una compra para ver el QR de cada entrada.', style: textTheme.bodySmall, textAlign: TextAlign.center),
                ],
              ),
            ),
    );
  }
}

class DetalleCompraPage extends StatefulWidget {
  const DetalleCompraPage({super.key, required this.compraId, required this.nombreEvento, this.api});
  final String compraId;
  final String nombreEvento;
  final BoleteriaApi? api;
  @override
  State<DetalleCompraPage> createState() => _DetalleCompraPageState();
}

class _DetalleCompraPageState extends State<DetalleCompraPage> {
  late final BoleteriaApi _api = widget.api ?? boleteriaApi;
  Map<String, dynamic>? _compra;
  String? _error;
  String? _aviso;

  @override
  void initState() {
    super.initState();
    _cargar();
  }

  Future<void> _cargar() async {
    try {
      final c = await _api.compra(widget.compraId);
      if (mounted) setState(() => _compra = c);
    } on BoleteriaApiException catch (e) {
      if (mounted) setState(() => _error = e.mensaje);
    }
  }

  /// CU-003: primero la cotización (pasos 2-4), después la confirmación con el monto aceptado.
  Future<void> _cancelar({List<String>? entradaIds}) async {
    setState(() {
      _error = null;
      _aviso = null;
    });
    final Map<String, dynamic> cotizacion;
    try {
      cotizacion = await _api.cotizarCancelacion(widget.compraId, entradaIds: entradaIds);
    } on BoleteriaApiException catch (e) {
      setState(() => _error = e.mensaje);
      return;
    }
    if (!mounted) return;
    final motivo = TextEditingController();
    final rechazadas = ((cotizacion['entradasRechazadas'] as List?) ?? []).cast<Map<String, dynamic>>();
    final confirmado = await showDialog<bool>(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setDialogo) => AlertDialog(
          title: const Text('Cancelar entradas'),
          content: SingleChildScrollView(
            child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(cotizacion['mensaje'] as String? ?? ''),
              const SizedBox(height: 8),
              Text('Reembolso: ${pesos(cotizacion['montoReembolso'] as num)} (${cotizacion['porcentajeReembolso']} %)',
                  style: const TextStyle(fontWeight: FontWeight.w700)),
              for (final r in rechazadas)
                Padding(padding: const EdgeInsets.only(top: 4), child: Text('• ${r['motivo'] ?? ''}')),
              const SizedBox(height: 12),
              TextField(
                controller: motivo,
                maxLines: 2,
                maxLength: 500,
                onChanged: (_) => setDialogo(() {}),
                decoration: const InputDecoration(labelText: 'Motivo (obligatorio)'),
              ),
            ]),
          ),
          actions: [
            TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Volver')),
            FilledButton(
              onPressed: motivo.text.trim().length >= 3 ? () => Navigator.pop(context, true) : null,
              child: const Text('Confirmar cancelación'),
            ),
          ],
        ),
      ),
    );
    if (confirmado != true) return;
    try {
      final resultado = await _api.cancelar(widget.compraId,
          motivo: motivo.text, montoAceptado: cotizacion['montoReembolso'] as num, entradaIds: entradaIds);
      activityLog.add(ActivityEntry(
        type: ActivityType.ticket,
        title: 'Cancelación · ${widget.nombreEvento}',
        subtitle: 'Reembolso aprobado',
        amount: -((resultado['montoReembolso'] as num).round()),
      ));
      if (mounted) setState(() => _aviso = resultado['mensaje'] as String? ?? 'Cancelación aprobada.');
    } on BoleteriaApiException catch (e) {
      if (mounted) setState(() => _error = e.mensaje);
    }
    await _cargar();
  }

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    final scheme = Theme.of(context).colorScheme;
    final c = _compra;
    final entradas = ((c?['entradas'] as List?) ?? []).cast<Map<String, dynamic>>();
    final cancelable = entradas.any((e) => e['estado'] == 'VALIDA');
    return GlassScaffold(
      appBar: const GlassAppBar(title: Text('Detalle de la compra')),
      body: c == null && _error == null
          ? const Center(child: CircularProgressIndicator())
          : ListView(
              padding: EdgeInsets.fromLTRB(16, kToolbarHeight + MediaQuery.of(context).padding.top + 20, 16, 24),
              children: [
                Text(widget.nombreEvento, style: textTheme.headlineSmall),
                if (c != null)
                  Text('Compra ${c['numeroCompra']} · ${pesos(c['total'] as num)} · ${_estadosCompra[c['estado']] ?? c['estado']}',
                      style: textTheme.bodyMedium?.copyWith(color: scheme.onSurface.withValues(alpha: 0.65))),
                if (_aviso != null) Padding(padding: const EdgeInsets.only(top: 8), child: Text(_aviso!, style: const TextStyle(color: Colors.green))),
                if (_error != null) Padding(padding: const EdgeInsets.only(top: 8), child: Text(_error!, style: TextStyle(color: scheme.error))),
                const SizedBox(height: 16),
                for (final e in entradas) ...[
                  TarjetaEntrada(
                    entrada: e,
                    onCancelar: entradas.length > 1 ? () => _cancelar(entradaIds: [e['id'] as String]) : null,
                  ),
                  const SizedBox(height: 12),
                ],
                if (cancelable)
                  OutlinedButton.icon(
                    onPressed: () => _cancelar(),
                    icon: const Icon(Icons.undo),
                    label: Text(entradas.length > 1 ? 'Cancelar toda la compra' : 'Cancelar la compra'),
                  ),
              ],
            ),
    );
  }
}
