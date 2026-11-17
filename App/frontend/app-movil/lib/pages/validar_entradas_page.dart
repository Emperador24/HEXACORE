import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../services/boleteria_api.dart';
import '../services/logistica_api_client.dart';
import '../services/puerta_local.dart';
import '../widgets/liquid_glass.dart';
import '../widgets/qr_scanner_sheet.dart';

/// Un intento de ingreso en esta sesión de la puerta, aceptado o no.
class _Intento {
  _Intento({
    required this.codigo,
    required this.autorizado,
    required this.titulo,
    this.detalle,
    this.sugerencia,
    this.sinConexion = false,
  });
  final String codigo;
  final bool autorizado;
  final String titulo;
  final String? detalle;
  final String? sugerencia;
  final bool sinConexion;
  final DateTime hora = DateTime.now();
}

typedef _Evento = ({String id, String nombre});

/// CU-002 desde la app del personal de ingreso, contra Acceso QR (Boletería).
///
/// El personal escanea (o escribe) el QR y el **servidor** decide: que sea de
/// este evento, que no esté usado ni anulado (CU-002A, CU-002D) y que haya
/// aforo (CU-002B). Si se autoriza, el servidor ya registró la hora y marcó el
/// QR como usado; la app solo muestra el resultado y el aforo que devolvió.
///
/// CU-002E: mientras hay red, la app guarda la lista de entradas válidas del
/// evento (como hashes). Si se cae la conexión, decide con esa lista, deja los
/// ingresos en cola y los sincroniza al volver; lo que el servidor no acepte
/// se muestra como conflicto para revisar.
///
/// El evento se elige de la cartelera; si el turno del empleado apunta a un
/// evento de la cartelera, queda preseleccionado.
class ValidarEntradasPage extends StatefulWidget {
  const ValidarEntradasPage({super.key, this.credencial, this.api, this.eventoDelTurno});
  final String? credencial;
  final BoleteriaApi? api;

  /// Solo para pruebas: de dónde sale el evento del turno.
  final Future<String?> Function()? eventoDelTurno;
  @override
  State<ValidarEntradasPage> createState() => _ValidarEntradasPageState();
}

class _ValidarEntradasPageState extends State<ValidarEntradasPage> {
  static const _llaveEventos = 'puerta.eventos';

  late final BoleteriaApi _api = widget.api ?? boleteriaApi;
  final _codigo = TextEditingController();
  List<_Evento> _eventos = [];
  String? _eventoId;
  PuertaLocal? _local;
  String? _error;
  String? _aviso;
  bool _cargando = true;
  bool _validando = false;
  bool _sincronizando = false;
  bool _sinRed = false;
  int? _asistentes;
  int? _aforoMaximo;
  final List<_Intento> _intentos = [];
  final List<Map<String, dynamic>> _conflictos = [];

  @override
  void initState() {
    super.initState();
    _iniciar();
  }

  @override
  void dispose() {
    _codigo.dispose();
    super.dispose();
  }

  Future<String?> _turno() async {
    if (widget.eventoDelTurno != null) return widget.eventoDelTurno!();
    final credencial = widget.credencial;
    if (credencial == null) return null;
    try {
      return (await logisticaApiClient.miTurno(credencial))?['eventoId'] as String?;
    } catch (_) {
      return null; // Sin turno legible, se elige el evento a mano.
    }
  }

  Future<void> _iniciar() async {
    final prefs = await SharedPreferences.getInstance();
    try {
      final r = await Future.wait([_api.cartelera(), _turno()]);
      _eventos = [
        for (final e in r[0] as List<EventoResumen>)
          if (!e.pasado) (id: e.id, nombre: e.nombre),
      ];
      // Para poder abrir la puerta aunque la app arranque sin red.
      await prefs.setString(_llaveEventos, jsonEncode([for (final e in _eventos) {'id': e.id, 'nombre': e.nombre}]));
      final delTurno = r[1] as String?;
      _eventoId = _eventos.any((e) => e.id == delTurno) ? delTurno : _eventos.firstOrNull?.id;
    } on BoleteriaApiException catch (e) {
      final guardados = (jsonDecode(prefs.getString(_llaveEventos) ?? '[]') as List).cast<Map<String, dynamic>>();
      if (e.codigo == 'SIN_CONEXION' && guardados.isNotEmpty) {
        _sinRed = true;
        _eventos = [for (final g in guardados) (id: g['id'] as String, nombre: g['nombre'] as String)];
        _eventoId = _eventos.first.id;
      } else {
        _error = e.mensaje;
      }
    }
    if (_eventoId != null) await _abrirEvento(_eventoId!);
    if (mounted) setState(() => _cargando = false);
  }

  /// Carga la lista y la cola guardadas del evento y, si hay red, las pone al día.
  Future<void> _abrirEvento(String eventoId) async {
    final local = PuertaLocal(eventoId);
    await local.cargar();
    _local = local;
    if (mounted) setState(() {});
    unawaited(_actualizarLista());
  }

  /// Sube lo pendiente y descarga la lista de válidos de nuevo.
  Future<void> _actualizarLista({bool avisar = false}) async {
    final local = _local;
    if (local == null) return;
    if (local.pendientes.isNotEmpty) await _sincronizar();
    try {
      final cache = await _api.cacheIngresos(local.eventoId);
      await local.guardarCache(cache);
      _sinRed = false;
      if (avisar) _aviso = 'Lista actualizada: ${local.validos} entradas válidas.';
    } on BoleteriaApiException catch (e) {
      if (e.codigo == 'SIN_CONEXION') {
        _sinRed = true;
      } else if (avisar) {
        _error = e.mensaje;
      }
    }
    if (mounted) setState(() {});
  }

  /// CU-002E: sube los ingresos hechos sin red. Los conflictos quedan a la vista.
  Future<void> _sincronizar() async {
    final local = _local;
    if (local == null || local.pendientes.isEmpty || _sincronizando) return;
    setState(() => _sincronizando = true);
    try {
      final respuesta = await _api.sincronizarIngresos(local.eventoId, local.pendientes.toList());
      final conflictos = await local.confirmarSincronizacion(respuesta);
      _conflictos.insertAll(0, conflictos);
      _sinRed = false;
      _aviso = 'Sincronizados: ${respuesta['registrados'] ?? 0} registrados'
          '${conflictos.isEmpty ? '' : ', ${conflictos.length} para revisar'}.';
    } on BoleteriaApiException catch (e) {
      if (e.codigo == 'SIN_CONEXION') {
        _sinRed = true;
      } else {
        _error = e.mensaje;
      }
    } finally {
      if (mounted) setState(() => _sincronizando = false);
    }
  }

  Future<void> _escanear() async {
    final valor = await showQrScannerSheet(context, title: 'Escanear entrada');
    if (valor == null || !mounted) return;
    await _validar(valor);
  }

  Future<void> _validar(String codigo) async {
    final eventoId = _eventoId;
    final limpio = codigo.trim();
    if (eventoId == null || limpio.length < 6 || _validando) return;
    setState(() {
      _validando = true;
      _error = null;
      _aviso = null;
    });
    try {
      final r = await _api.validarIngreso(eventoId, limpio);
      _sinRed = false;
      _asistentes = (r['asistentes'] as num?)?.toInt();
      _aforoMaximo = (r['aforoMaximo'] as num?)?.toInt();
      _intentos.insert(
        0,
        _Intento(
          codigo: limpio,
          autorizado: true,
          titulo: r['mensaje'] as String? ?? 'Ingreso autorizado',
          detalle: '${r['localidadNombre'] ?? ''} · Ticket ${r['numeroTicket'] ?? ''}',
        ),
      );
      _codigo.clear();
      await _local?.marcarNoValido(limpio);
      // Volvió la red: lo que quedó en cola se sube ya.
      if (_local?.pendientes.isNotEmpty ?? false) unawaited(_sincronizar());
    } on BoleteriaApiException catch (e) {
      if (e.codigo != null && e.codigo!.startsWith('CU-002')) {
        _sinRed = false;
        final primer = e.cuerpo?['primerIngreso'] as String?;
        _intentos.insert(
          0,
          _Intento(
            codigo: limpio,
            autorizado: false,
            titulo: e.mensaje,
            detalle: switch (e.codigo) {
              'CU-002A' => 'QR inválido, de otro evento o anulado',
              'CU-002B' => 'Aforo completo',
              'CU-002D' => primer == null ? 'Ya utilizado' : 'Ya utilizado · primer ingreso ${_hora(DateTime.parse(primer).toLocal())}',
              _ => null,
            },
            sugerencia: e.cuerpo?['sugerencia'] as String?,
          ),
        );
        _codigo.clear();
        // Usada o anulada: tampoco vale para la lista sin red. El aforo lleno no la invalida.
        if (e.codigo != 'CU-002B') await _local?.marcarNoValido(limpio);
      } else if (e.codigo == 'SIN_CONEXION') {
        _sinRed = true;
        await _validarSinRed(limpio);
      } else {
        // Sesión vencida u otro error: no es un veredicto sobre la entrada.
        _error = e.mensaje;
      }
    } finally {
      if (mounted) setState(() => _validando = false);
    }
  }

  /// CU-002E: sin red se decide con la lista guardada; sin lista, no se decide.
  Future<void> _validarSinRed(String codigo) async {
    final decision = await _local?.ingreso(codigo);
    if (decision == null) {
      _error = 'Sin conexión y sin la lista de entradas descargada: no se puede validar. '
          'Conéctate un momento para descargarla.';
      return;
    }
    _intentos.insert(
      0,
      _Intento(
        codigo: codigo,
        autorizado: decision.autorizado,
        titulo: decision.mensaje,
        detalle: decision.autorizado ? '${decision.localidadNombre ?? ''} · Ticket ${decision.numeroTicket ?? ''}' : null,
        sinConexion: true,
      ),
    );
    _codigo.clear();
  }

  static String _hora(DateTime h) =>
      '${h.hour.toString().padLeft(2, '0')}:${h.minute.toString().padLeft(2, '0')}:${h.second.toString().padLeft(2, '0')}';

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    final scheme = Theme.of(context).colorScheme;
    if (_cargando) return const Center(child: CircularProgressIndicator());
    final ultimo = _intentos.firstOrNull;
    final aforo = _aforoMaximo;
    final local = _local;
    final pendientes = local?.pendientes.length ?? 0;
    return ListView(padding: const EdgeInsets.all(16), children: [
      if (_eventos.isEmpty)
        Text(_error ?? 'No hay eventos próximos para validar entradas.')
      else ...[
        DropdownButtonFormField<String>(
          initialValue: _eventoId,
          isExpanded: true,
          decoration: const InputDecoration(labelText: 'Evento de esta puerta'),
          items: [for (final e in _eventos) DropdownMenuItem(value: e.id, child: Text(e.nombre, overflow: TextOverflow.ellipsis))],
          onChanged: (v) {
            if (v == null) return;
            setState(() {
              _eventoId = v;
              _asistentes = null;
              _aforoMaximo = null;
              _intentos.clear();
              _conflictos.clear();
              _aviso = null;
              _error = null;
            });
            _abrirEvento(v);
          },
        ),
        const SizedBox(height: 12),
        LiquidGlassCard(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(children: [
              Text('Aforo', style: textTheme.titleSmall),
              const Spacer(),
              Text(_asistentes == null ? '—' : '$_asistentes${aforo == null ? '' : '/$aforo'}',
                  style: textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w700)),
            ]),
            if (_asistentes != null && aforo != null && aforo > 0) ...[
              const SizedBox(height: 10),
              ClipRRect(
                borderRadius: BorderRadius.circular(6),
                child: LinearProgressIndicator(
                  value: (_asistentes! / aforo).clamp(0, 1).toDouble(),
                  minHeight: 8,
                  backgroundColor: scheme.outlineVariant.withValues(alpha: 0.3),
                  color: _asistentes! / aforo > 0.9 ? scheme.error : scheme.primary,
                ),
              ),
            ] else
              Text('Se actualiza con cada ingreso que registra el servidor.', style: textTheme.bodySmall),
          ]),
        ),
        const SizedBox(height: 12),
        _ModoSinRed(
          sinRed: _sinRed,
          local: local,
          pendientes: pendientes,
          sincronizando: _sincronizando,
          onSincronizar: _sincronizar,
          onActualizar: () => _actualizarLista(avisar: true),
          hora: _hora,
        ),
        const SizedBox(height: 16),
        FilledButton.icon(
          onPressed: _eventoId == null || _validando ? null : _escanear,
          icon: const Icon(Icons.qr_code_scanner),
          label: const Text('Escanear entrada'),
        ),
        const SizedBox(height: 8),
        Row(children: [
          Expanded(
            child: TextField(
              controller: _codigo,
              // Los códigos llevan base64url: distinguen mayúsculas, no se fuerzan.
              autocorrect: false,
              enableSuggestions: false,
              decoration: const InputDecoration(labelText: 'O escribe el código', hintText: 'HXC-QR-…'),
              onSubmitted: _validar,
            ),
          ),
          const SizedBox(width: 8),
          OutlinedButton(
            onPressed: _eventoId == null || _validando ? null : () => _validar(_codigo.text),
            child: _validando
                ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
                : const Text('Validar'),
          ),
        ]),
        if (_error != null) Padding(padding: const EdgeInsets.only(top: 8), child: Text(_error!, style: TextStyle(color: scheme.error))),
        if (_aviso != null) Padding(padding: const EdgeInsets.only(top: 8), child: Text(_aviso!, style: textTheme.bodySmall)),
        if (_conflictos.isNotEmpty) ...[
          const SizedBox(height: 16),
          LiquidGlassCard(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [
                Icon(Icons.warning_amber_rounded, color: scheme.error),
                const SizedBox(width: 8),
                Expanded(child: Text('Para revisar: no se registraron al sincronizar', style: textTheme.titleSmall)),
              ]),
              for (final c in _conflictos)
                ListTile(
                  dense: true,
                  contentPadding: EdgeInsets.zero,
                  title: Text('${c['codigoQr']}', style: const TextStyle(fontFamily: 'monospace')),
                  subtitle: Text('${c['resultado']}: ${c['mensaje']}'),
                ),
              Align(
                alignment: Alignment.centerRight,
                child: TextButton(onPressed: () => setState(_conflictos.clear), child: const Text('Revisados')),
              ),
            ]),
          ),
        ],
        const SizedBox(height: 16),
        if (ultimo != null) _Resultado(intento: ultimo),
        if (_intentos.length > 1) ...[
          const SizedBox(height: 16),
          Text('Anteriores', style: textTheme.titleSmall),
          for (final i in _intentos.skip(1).take(10))
            ListTile(
              dense: true,
              contentPadding: EdgeInsets.zero,
              leading: Icon(i.autorizado ? Icons.check_circle : Icons.block, color: i.autorizado ? Colors.green : scheme.error),
              title: Text(i.codigo, style: const TextStyle(fontFamily: 'monospace')),
              subtitle: Text('${i.detalle ?? i.titulo}${i.sinConexion ? ' · sin conexión' : ''}'),
              trailing: Text(_hora(i.hora), style: textTheme.bodySmall),
            ),
        ],
      ],
    ]);
  }
}

/// Estado del modo sin red: si hay conexión, la lista guardada y la cola por subir.
class _ModoSinRed extends StatelessWidget {
  const _ModoSinRed({
    required this.sinRed,
    required this.local,
    required this.pendientes,
    required this.sincronizando,
    required this.onSincronizar,
    required this.onActualizar,
    required this.hora,
  });
  final bool sinRed;
  final PuertaLocal? local;
  final int pendientes;
  final bool sincronizando;
  final VoidCallback onSincronizar;
  final VoidCallback onActualizar;
  final String Function(DateTime) hora;

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    final scheme = Theme.of(context).colorScheme;
    final generada = local?.cacheGeneradaEn;
    return LiquidGlassCard(
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Icon(sinRed ? Icons.wifi_off : Icons.wifi, size: 18, color: sinRed ? scheme.error : Colors.green),
          const SizedBox(width: 8),
          Expanded(
            child: Text(sinRed ? 'Sin conexión: se valida con la lista guardada' : 'En línea',
                style: textTheme.titleSmall),
          ),
          TextButton(onPressed: sincronizando ? null : onActualizar, child: const Text('Actualizar')),
        ]),
        Text(
          local?.tieneCache ?? false
              ? 'Lista sin conexión: ${local!.validos} entradas válidas${generada == null ? '' : ' · descargada ${hora(generada)}'}'
              : 'Aún no hay lista guardada para operar sin conexión.',
          style: textTheme.bodySmall,
        ),
        if (pendientes > 0)
          Row(children: [
            Expanded(child: Text('$pendientes ingreso${pendientes == 1 ? '' : 's'} por sincronizar', style: textTheme.bodyMedium)),
            TextButton(
              onPressed: sincronizando ? null : onSincronizar,
              child: sincronizando
                  ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2))
                  : const Text('Sincronizar'),
            ),
          ]),
      ]),
    );
  }
}

class _Resultado extends StatelessWidget {
  const _Resultado({required this.intento});
  final _Intento intento;

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    final color = intento.autorizado ? Colors.green : Theme.of(context).colorScheme.error;
    return LiquidGlassCard(
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          TintedIconBadge(icon: intento.autorizado ? Icons.check_circle_outline : Icons.block, color: color, size: 44),
          const SizedBox(width: 12),
          Expanded(child: Text(intento.autorizado ? 'Puede ingresar' : 'NO puede ingresar', style: textTheme.titleLarge?.copyWith(color: color))),
        ]),
        if (intento.sinConexion) ...[
          const SizedBox(height: 6),
          Row(children: [
            const Icon(Icons.wifi_off, size: 16),
            const SizedBox(width: 6),
            Text('Decidido sin conexión, con la lista guardada', style: textTheme.bodySmall),
          ]),
        ],
        const SizedBox(height: 10),
        Text(intento.titulo, style: textTheme.bodyMedium?.copyWith(fontWeight: FontWeight.w600)),
        if (intento.detalle != null) Text(intento.detalle!, style: textTheme.bodyMedium),
        const SizedBox(height: 4),
        Text(intento.codigo, style: const TextStyle(fontFamily: 'monospace')),
        if (intento.autorizado) ...[
          const SizedBox(height: 8),
          Text('Confirma que la persona corresponde a la entrada antes de dejarla pasar.', style: textTheme.bodySmall),
        ],
        if (intento.sugerencia != null) ...[
          const SizedBox(height: 8),
          Text(intento.sugerencia!, style: textTheme.bodySmall),
        ],
      ]),
    );
  }
}
