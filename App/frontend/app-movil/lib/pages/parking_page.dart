import 'dart:async';

import 'package:flutter/material.dart';
import 'package:qr_flutter/qr_flutter.dart';

import '../services/parqueadero_api.dart';
import '../widgets/liquid_glass.dart';

const _tipos = {'AUTOMOVIL': 'Automóvil', 'MOTO': 'Moto', 'DISCAPACIDAD': 'Movilidad reducida'};
const _estados = {
  'PENDIENTE_PAGO': 'Pendiente de pago',
  'PAGANDO': 'Pago en proceso',
  'CONFIRMADA': 'Confirmada',
  'USADA': 'Usada',
  'EXPIRADA': 'Vencida',
};

/// Los caminos de la pasarela simulada, para poder demostrar cada uno.
const _tokensDemo = {'tok_ok_movil': 'Pago aprobado', 'tok_rechazo_movil': 'Pago rechazado (CU-021B)'};

/// CU-021 desde la app del cliente: elegir evento, zona y vehículo, pagar la
/// reserva y mostrar el QR para el punto de control (CU-022). Mismo contrato
/// que el portal web (RNF-14); el precio, el espacio y lo que se puede
/// reservar lo decide el servidor.
class ParkingPage extends StatefulWidget {
  const ParkingPage({super.key, this.api});
  final ParqueaderoApi? api;
  @override
  State<ParkingPage> createState() => _ParkingPageState();
}

class _ParkingPageState extends State<ParkingPage> {
  late final ParqueaderoApi _api = widget.api ?? parqueaderoApi;
  final _placa = TextEditingController();
  List<EventoCartelera> _eventos = [];
  String? _eventoId;
  Map<String, dynamic>? _disponibilidad;
  String? _zonaId;
  String _tipo = 'AUTOMOVIL';
  List<Map<String, dynamic>> _reservas = [];
  List<Map<String, dynamic>> _alternativas = [];
  String? _error;
  bool _cargando = true;
  Timer? _reloj;

  @override
  void initState() {
    super.initState();
    _iniciar();
    // La cuenta atrás del pago (CU-021C).
    _reloj = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted && _reservas.any((r) => r['estado'] == 'PENDIENTE_PAGO')) setState(() {});
    });
  }

  @override
  void dispose() {
    _reloj?.cancel();
    _placa.dispose();
    super.dispose();
  }

  Future<void> _iniciar() async {
    try {
      final r = await Future.wait([_api.eventosProximos(), _api.misReservas()]);
      _eventos = r[0] as List<EventoCartelera>;
      _reservas = r[1] as List<Map<String, dynamic>>;
      if (_eventos.isNotEmpty) await _elegirEvento(_eventos.first.id);
    } catch (e) {
      _error = e.toString();
    }
    if (mounted) setState(() => _cargando = false);
  }

  Future<void> _elegirEvento(String id) async {
    setState(() {
      _eventoId = id;
      _disponibilidad = null;
      _alternativas = [];
      _error = null;
    });
    try {
      final d = await _api.disponibilidad(id);
      final zonas = (d['zonas'] as List).cast<Map<String, dynamic>>();
      if (!mounted) return;
      setState(() {
        _disponibilidad = d;
        _zonaId = (zonas.where((z) => (z['disponibles'][_tipo] as num) > 0).firstOrNull ?? zonas.firstOrNull)?['id'] as String?;
      });
    } catch (e) {
      if (mounted) setState(() => _error = e.toString());
    }
  }

  Future<void> _recargarReservas() async {
    try {
      final reservas = await _api.misReservas();
      if (mounted) setState(() => _reservas = reservas);
    } catch (_) {}
  }

  /// Como la guarda el servidor: mayúsculas, sin guiones ni espacios.
  String get _placaNormalizada => _placa.text.replaceAll(RegExp(r'[-\s]'), '').toUpperCase();

  /// El formato que publica el servidor para este tipo (carro ABC123, moto ABC12D).
  /// La regla es suya; aquí solo se usa para avisar antes de enviar (RNF-14).
  Map<String, dynamic>? get _formato => (_disponibilidad?['formatosPlaca'] as Map?)?[_tipo] as Map<String, dynamic>?;

  bool get _placaValida {
    final formato = _formato;
    return formato == null ? _placaNormalizada.length >= 4 : RegExp(formato['patron'] as String).hasMatch(_placaNormalizada);
  }

  /// Al cambiar el tipo, si la zona elegida no tiene espacios de ese tipo, se pasa a una que sí.
  void _elegirTipo(String tipo) {
    final zonas = ((_disponibilidad?['zonas'] as List?) ?? []).cast<Map<String, dynamic>>();
    num libres(String? id) => (zonas.where((z) => z['id'] == id).firstOrNull?['disponibles'][tipo] as num?) ?? 0;
    setState(() {
      _tipo = tipo;
      _error = null;
      if (libres(_zonaId) == 0) _zonaId = zonas.where((z) => (z['disponibles'][tipo] as num) > 0).firstOrNull?['id'] as String? ?? _zonaId;
    });
  }

  /// Antes de apartar el espacio: que la placa y el vehículo sean los correctos.
  Future<bool> _confirmarDatos(String zona) async =>
      await showDialog<bool>(
        context: context,
        builder: (context) => AlertDialog(
          title: const Text('Revisa los datos'),
          content: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(_placaNormalizada,
                style: Theme.of(context).textTheme.headlineSmall?.copyWith(fontFamily: 'monospace', letterSpacing: 2)),
            Text('${_tipos[_tipo]} · $zona'),
            if (_disponibilidad?['precio'] != null) Text('Total: \$${(_disponibilidad!['precio'] as num).round()}'),
          ]),
          actions: [
            TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Corregir')),
            FilledButton(onPressed: () => Navigator.pop(context, true), child: const Text('Sí, la placa es correcta')),
          ],
        ),
      ) ??
      false;

  Future<void> _reservar() async {
    final eventoId = _eventoId, zonaId = _zonaId;
    if (eventoId == null || zonaId == null || !_placaValida) return;
    final zonas = ((_disponibilidad?['zonas'] as List?) ?? []).cast<Map<String, dynamic>>();
    final nombreZona = zonas.where((z) => z['id'] == zonaId).firstOrNull?['nombre'] as String? ?? '';
    if (!await _confirmarDatos(nombreZona) || !mounted) return;
    setState(() {
      _error = null;
      _alternativas = [];
    });
    try {
      final reserva = await _api.reservar(eventoId, zonaId: zonaId, placa: _placaNormalizada, tipoVehiculo: _tipo);
      _placa.clear();
      await _recargarReservas();
      if (mounted) await _pagar(reserva);
    } on ParqueaderoApiException catch (e) {
      setState(() {
        _error = e.mensaje;
        // CU-021A: zonas que sí tienen espacio.
        if (e.codigo == 'CU-021A') _alternativas = ((e.cuerpo?['alternativas'] as List?) ?? []).cast<Map<String, dynamic>>();
      });
    }
    await _elegirEvento(eventoId);
  }

  /// Pasos 5-9: la pasarela cobra; un rechazo deja la reserva para reintentar.
  Future<void> _pagar(Map<String, dynamic> reserva) async {
    var token = _tokensDemo.keys.first;
    String? error;
    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (context) => StatefulBuilder(
        builder: (context, setSheet) => Padding(
          padding: EdgeInsets.fromLTRB(24, 24, 24, 24 + MediaQuery.of(context).viewInsets.bottom),
          child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.stretch, children: [
            Text('Pagar reserva', style: Theme.of(context).textTheme.titleLarge),
            const SizedBox(height: 8),
            Text('${reserva['zona']} · espacio ${reserva['espacio']} · ${reserva['horas']} h'),
            Text('Total: \$${(reserva['monto'] as num).round()}',
                style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700)),
            const SizedBox(height: 12),
            Text('Resultado de la pasarela (demostración)', style: Theme.of(context).textTheme.bodySmall),
            Material(
              type: MaterialType.transparency,
              child: RadioGroup<String>(
                groupValue: token,
                onChanged: (v) => setSheet(() => token = v!),
                child: Column(children: [
                  for (final t in _tokensDemo.entries)
                    RadioListTile<String>(contentPadding: EdgeInsets.zero, value: t.key, title: Text(t.value)),
                ]),
              ),
            ),
            if (error != null) Text(error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
            const SizedBox(height: 8),
            LoadingFilledButton(
              label: 'Confirmar pago',
              onPressed: () async {
                try {
                  await _api.pagar(reserva['id'] as String, token);
                  if (context.mounted) Navigator.pop(context);
                } on ParqueaderoApiException catch (e) {
                  setSheet(() => error = e.mensaje);
                }
              },
            ),
          ]),
        ),
      ),
    );
    await _recargarReservas();
  }

  String _restante(Map<String, dynamic> r) {
    final s = DateTime.parse(r['expiraEn'] as String).difference(DateTime.now()).inSeconds.clamp(0, 1 << 30);
    return '${s ~/ 60}:${(s % 60).toString().padLeft(2, '0')}';
  }

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    final scheme = Theme.of(context).colorScheme;
    if (_cargando) return const Center(child: CircularProgressIndicator());
    final d = _disponibilidad;
    final zonas = d == null ? <Map<String, dynamic>>[] : (d['zonas'] as List).cast<Map<String, dynamic>>();
    final libres = zonas.where((z) => z['id'] == _zonaId).map((z) => (z['disponibles'][_tipo] as num).toInt()).firstOrNull ?? 0;
    final libresTotales = zonas.fold<int>(0, (n, z) => n + (z['disponibles'][_tipo] as num).toInt());
    final formato = _formato;
    final esMoto = _tipo == 'MOTO';
    return RefreshIndicator(
      onRefresh: () async {
        await _recargarReservas();
        if (_eventoId != null) await _elegirEvento(_eventoId!);
      },
      child: ListView(padding: const EdgeInsets.all(16), children: [
        for (final r in _reservas.where((r) => r['estado'] != 'EXPIRADA')) ...[
          _TarjetaReserva(reserva: r, restante: _restante(r), onPagar: () => _pagar(r)),
          const SizedBox(height: 12),
        ],
        Text('Reservar parqueadero', style: textTheme.titleLarge),
        const SizedBox(height: 12),
        if (_eventos.isEmpty)
          Text(_error ?? 'No hay eventos próximos para reservar parqueadero.')
        else
          LiquidGlassCard(
            borderRadius: BorderRadius.circular(28),
            child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
              DropdownButtonFormField<String>(
                initialValue: _eventoId,
                isExpanded: true,
                decoration: const InputDecoration(labelText: 'Evento'),
                items: [for (final e in _eventos) DropdownMenuItem(value: e.id, child: Text(e.nombre, overflow: TextOverflow.ellipsis))],
                onChanged: (v) => v == null ? null : _elegirEvento(v),
              ),
              const SizedBox(height: 8),
              DropdownButtonFormField<String>(
                initialValue: _tipo,
                decoration: const InputDecoration(labelText: 'Tipo de vehículo'),
                items: [for (final t in _tipos.entries) DropdownMenuItem(value: t.key, child: Text(t.value))],
                onChanged: (v) => _elegirTipo(v!),
              ),
              const SizedBox(height: 12),
              if (d == null && _error == null)
                const Center(child: Padding(padding: EdgeInsets.all(12), child: CircularProgressIndicator()))
              else if (d != null) ...[
                if (d['reservable'] != true)
                  Text(d['motivo'] as String? ?? 'No quedan espacios para reservar en este evento.', style: textTheme.bodySmall),
                Text(
                  libresTotales == 0
                      ? 'No hay espacios para ${_tipos[_tipo]!.toLowerCase()} en este evento.'
                      : '$libresTotales espacios libres para ${_tipos[_tipo]!.toLowerCase()} en total.',
                  style: textTheme.bodySmall,
                ),
                Material(
                  type: MaterialType.transparency,
                  child: RadioGroup<String>(
                    groupValue: _zonaId,
                    onChanged: (v) => setState(() {
                      _zonaId = v;
                      _alternativas = [];
                    }),
                    child: Column(children: [
                      for (final z in zonas)
                        RadioListTile<String>(
                          contentPadding: EdgeInsets.zero,
                          value: z['id'] as String,
                          enabled: (z['disponibles'][_tipo] as num) > 0,
                          title: Text(z['nombre'] as String),
                          subtitle: Text((z['disponibles'][_tipo] as num) > 0 ? '${z['disponibles'][_tipo]} libres' : 'Sin espacios'),
                        ),
                    ]),
                  ),
                ),
                TextField(
                  controller: _placa,
                  textCapitalization: TextCapitalization.characters,
                  maxLength: 10,
                  decoration: InputDecoration(
                    labelText: 'Placa del vehículo',
                    counterText: '',
                    hintText: formato?['ejemplo'] as String? ?? 'ABC123',
                    helperText: formato == null ? null : 'Placa de ${esMoto ? 'moto' : 'carro'}: ${formato['descripcion']}',
                    errorText: _placa.text.isNotEmpty && !_placaValida
                        ? 'No es una placa de ${esMoto ? 'moto' : 'carro'} válida${formato == null ? '' : ': ${formato['descripcion']}'}'
                        : null,
                  ),
                  onChanged: (_) => setState(() {}),
                ),
                if (d['precio'] != null) ...[
                  const SizedBox(height: 12),
                  Text('Total: \$${(d['precio'] as num).round()}', style: textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700)),
                  Text('${d['horas']} h hasta el final del evento. El espacio se te guarda ${d['minutosParaPagar']} min mientras pagas.',
                      style: textTheme.bodySmall),
                ],
              ],
              if (_error != null) ...[
                const SizedBox(height: 8),
                Text(_error!, style: TextStyle(color: scheme.error)),
              ],
              if (_alternativas.isNotEmpty)
                Wrap(spacing: 8, children: [
                  for (final a in _alternativas)
                    ActionChip(
                      label: Text('${a['nombre']} · ${a['disponibles']} libres'),
                      onPressed: () => setState(() {
                        _zonaId = a['id'] as String;
                        _alternativas = [];
                      }),
                    ),
                ]),
              const SizedBox(height: 12),
              FilledButton.icon(
                onPressed: d?['reservable'] == true && _zonaId != null && libres > 0 && _placaValida ? _reservar : null,
                icon: const Icon(Icons.local_parking_outlined),
                label: const Text('Reservar y pagar'),
              ),
            ]),
          ),
      ]),
    );
  }
}

class _TarjetaReserva extends StatelessWidget {
  const _TarjetaReserva({required this.reserva, required this.restante, required this.onPagar});
  final Map<String, dynamic> reserva;
  final String restante;
  final VoidCallback onPagar;

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    final scheme = Theme.of(context).colorScheme;
    final estado = reserva['estado'] as String;
    final qr = reserva['codigoQr'] as String?;
    return LiquidGlassCard(
      borderRadius: BorderRadius.circular(32),
      child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
        Row(children: [
          TintedIconBadge(icon: Icons.local_parking, color: scheme.primary),
          const SizedBox(width: 14),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text((reserva['evento'] as Map?)?['nombre'] as String? ?? '', style: textTheme.titleSmall),
              Text('${reserva['placa']} · ${_tipos[reserva['tipoVehiculo']] ?? ''}',
                  style: textTheme.bodySmall?.copyWith(color: scheme.onSurface.withValues(alpha: 0.6))),
            ]),
          ),
          StatusChip(label: _estados[estado] ?? estado, color: estado == 'CONFIRMADA' ? Colors.green : scheme.primary),
        ]),
        const SizedBox(height: 14),
        Align(
          alignment: Alignment.centerLeft,
          child: TintedBadge(color: scheme.primary, child: Text('${(reserva['zona'] as String).toUpperCase()} · ESPACIO ${reserva['espacio']}')),
        ),
        if (qr != null && estado == 'CONFIRMADA') ...[
          const SizedBox(height: 16),
          Center(
            child: Container(
              padding: const EdgeInsets.all(12),
              decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(20)),
              child: QrImageView(data: qr, size: 170, semanticsLabel: 'Código QR de la reserva de parqueadero'),
            ),
          ),
          const SizedBox(height: 8),
          Center(child: Text(qr, style: const TextStyle(fontFamily: 'monospace', fontWeight: FontWeight.w700, letterSpacing: 1.1))),
        ],
        if (estado == 'PENDIENTE_PAGO') ...[
          const SizedBox(height: 12),
          Text('Paga antes de $restante o el espacio se libera.', style: textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.w600)),
          if (reserva['motivo'] != null) Text(reserva['motivo'] as String, style: TextStyle(color: scheme.error)),
          const SizedBox(height: 8),
          FilledButton(onPressed: restante == '0:00' ? null : onPagar, child: Text('Pagar \$${(reserva['monto'] as num).round()}')),
        ],
      ]),
    );
  }
}
