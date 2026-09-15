import 'dart:async';

import 'package:flutter/material.dart';

import '../models/activity_log.dart';
import '../services/reventa_api.dart';
import '../widgets/liquid_glass.dart';

const _kIndigo = Color(0xFF3B5BFF);
const _kGreen = Color(0xFF34D399);
const _kAmber = Color(0xFFFFB020);
const _kRed = Color(0xFFF87171);

/// Formatea un importe en pesos sin depender de `intl`: 300000 -> "$300.000".
String _pesos(double valor) {
  final entero = valor.round().toString();
  final buffer = StringBuffer();
  for (var i = 0; i < entero.length; i++) {
    if (i > 0 && (entero.length - i) % 3 == 0) buffer.write('.');
    buffer.write(entero[i]);
  }
  return '\$$buffer';
}

/// Mercado secundario de entradas (**CU-006**).
///
/// La pestaña **"Mis entradas"** habla ya con el Servicio de Entradas y
/// Mercado Secundario: publicar (pasos 1-4), cambiar el precio (CU-006A) y
/// retirar del mercado (CU-006B).
///
/// La pestaña **"Mercado"** sigue con datos de ejemplo: la consulta del
/// mercado (paso 5) y la compra con bloqueo y pago (pasos 6-13) todavía no
/// existen en el backend.
///
/// Ninguna regla de reventa se decide aquí. Si una entrada puede publicarse,
/// cuál es su precio máximo y por qué está bloqueada lo dice el backend en
/// cada respuesta — RNF-14 pide *"0 reglas de negocio duplicadas en el
/// cliente"*, y ASR-10 que web y móvil consuman la misma API.
class ResaleMarketplacePage extends StatefulWidget {
  const ResaleMarketplacePage({super.key});
  @override
  State<ResaleMarketplacePage> createState() => _ResaleMarketplacePageState();
}

class _ResaleMarketplacePageState extends State<ResaleMarketplacePage> {
  bool _market = false;

  List<EntradaPropia>? _entradas;
  String? _error;
  bool _cargando = true;

  Mercado? _mercadoDatos;
  String? _errorMercado;
  bool _cargandoMercado = false;
  OrdenMercado _orden = OrdenMercado.recientes;

  @override
  void initState() {
    super.initState();
    _cargar();
  }

  /// Carga lo que corresponda a la pestaña visible. La usa también el
  /// "deslizar para refrescar", para no ir a buscar datos que no se ven.
  Future<void> _refrescar() => _market ? _cargarMercado() : _cargar();

  Future<void> _cargarMercado() async {
    setState(() {
      _cargandoMercado = true;
      _errorMercado = null;
    });
    try {
      final mercado = await reventaApi.consultarMercado(orden: _orden);
      if (!mounted) return;
      setState(() {
        _mercadoDatos = mercado;
        _cargandoMercado = false;
      });
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _errorMercado = _texto(error);
        _cargandoMercado = false;
      });
    }
  }

  /// Mensaje a mostrar para un error. Si viene del backend se usa tal cual:
  /// el dominio redacta sus motivos, el cliente no los reescribe (RNF-14).
  String _texto(Object error) => error is ReventaApiException
      ? error.mensaje
      : 'No se pudo conectar con el servidor, intenta de nuevo.';

  Future<void> _cargar() async {
    setState(() {
      _cargando = true;
      _error = null;
    });
    try {
      final entradas = await reventaApi.misEntradas();
      if (!mounted) return;
      setState(() {
        _entradas = entradas;
        _cargando = false;
      });
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _error = _texto(error);
        _cargando = false;
      });
    }
  }

  void _aviso(String texto, {bool exito = true}) {
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(
      content: Text(texto),
      backgroundColor: exito ? null : _kRed,
    ));
  }

  /// Hoja de publicar o de cambiar precio; al terminar bien, recarga la lista.
  Future<void> _hojaPrecio(EntradaPropia entrada, {required bool cambiar}) async {
    final publicacion = entrada.publicacion;
    final controlador = TextEditingController(
        text: (cambiar && publicacion != null
                ? publicacion.precio
                : entrada.precioOriginal)
            .round()
            .toString());
    String? errorEnHoja;

    final hecho = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      builder: (context) => StatefulBuilder(
        builder: (context, setHoja) => Padding(
          padding: EdgeInsets.only(
              left: 24,
              right: 24,
              top: 24,
              bottom: MediaQuery.of(context).viewInsets.bottom + 24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                  cambiar
                      ? 'Cambiar precio · ${entrada.eventoNombre}'
                      : 'Publicar ${entrada.eventoNombre}',
                  style:
                      const TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
              const SizedBox(height: 4),
              Text('Precio original: ${_pesos(entrada.precioOriginal)}'),
              if (entrada.precioMaximo != null)
                Text('Máximo permitido: ${_pesos(entrada.precioMaximo!)}',
                    style: const TextStyle(color: _kAmber)),
              const SizedBox(height: 16),
              TextField(
                controller: controlador,
                keyboardType: TextInputType.number,
                autofocus: true,
                decoration: InputDecoration(
                  labelText: 'Precio de reventa',
                  errorText: errorEnHoja,
                  errorMaxLines: 3,
                ),
              ),
              const SizedBox(height: 16),
              LoadingFilledButton(
                label: cambiar ? 'Guardar precio' : 'Publicar',
                onPressed: () async {
                  final precio = double.tryParse(controlador.text.trim());
                  if (precio == null || precio <= 0) {
                    setHoja(() => errorEnHoja = 'Escribe un precio válido.');
                    return;
                  }
                  try {
                    if (cambiar && publicacion != null) {
                      await reventaApi.cambiarPrecio(
                          publicacionId: publicacion.id, precio: precio);
                    } else {
                      await reventaApi.publicar(
                          entradaId: entrada.id, precio: precio);
                      activityLog.add(ActivityEntry(
                          type: ActivityType.resale,
                          title: entrada.eventoNombre,
                          subtitle:
                              'Publicada en reventa · ${entrada.numeroTicket}',
                          amount: precio.round()));
                    }
                    if (!context.mounted) return;
                    Navigator.pop(context, true);
                  } catch (error) {
                    // El texto lo redacta el backend: aquí no se reconstruye
                    // el motivo a partir del código (RNF-14).
                    setHoja(() => errorEnHoja = _texto(error));
                  }
                },
              ),
            ],
          ),
        ),
      ),
    );

    if (hecho == true && mounted) {
      _aviso(cambiar ? 'Precio actualizado.' : 'Entrada publicada en el mercado.');
      await _cargar();
    }
  }

  /// Flujo alterno CU-006B: retirar del mercado.
  Future<void> _retirar(EntradaPropia entrada) async {
    final publicacion = entrada.publicacion;
    if (publicacion == null) return;
    try {
      await reventaApi.retirar(publicacion.id);
      if (!mounted) return;
      _aviso('Entrada retirada del mercado.');
      await _cargar();
    } catch (error) {
      if (!mounted) return;
      _aviso(_texto(error), exito: false);
    }
  }

  /// La otra mitad del paso 5: "y selecciona una para comprar".
  ///
  /// Vuelve a pedir el detalle al servidor antes de mostrar nada. Entre que se
  /// cargó la lista y este toque pueden haber pasado minutos, y en ese rato
  /// otra persona pudo comprar la entrada o el vendedor retirarla: mostrar un
  /// resumen con el precio de hace diez minutos sería mentir.
  Future<void> _abrirPublicacion(PublicacionMercado resumen) async {
    PublicacionMercado detalle;
    try {
      detalle = await reventaApi.detallePublicacion(resumen.id);
    } catch (error) {
      if (!mounted) return;
      _aviso(_texto(error), exito: false);
      return;
    }
    if (!mounted) return;

    if (!detalle.sigueDisponible) {
      _aviso('Esta entrada ya no está disponible.', exito: false);
      await _cargarMercado();
      return;
    }

    String? errorEnHoja;
    final checkout = await showModalBottomSheet<Checkout>(
      context: context,
      isScrollControlled: true,
      builder: (context) => StatefulBuilder(
        builder: (context, setHoja) => Padding(
          padding: EdgeInsets.only(
              left: 24,
              right: 24,
              top: 24,
              bottom: MediaQuery.of(context).viewInsets.bottom + 24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Text('Resumen de la compra',
                  style: TextStyle(fontSize: 20, fontWeight: FontWeight.w600)),
              const SizedBox(height: 12),
              Text(detalle.eventoNombre,
                  style: const TextStyle(fontWeight: FontWeight.w600)),
              Text('${detalle.localidadNombre} · ${detalle.lugar}'),
              const Divider(height: 24),
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  const Text('Total'),
                  Text(_pesos(detalle.precio),
                      style: const TextStyle(
                          fontSize: 18, fontWeight: FontWeight.bold)),
                ],
              ),
              if (detalle.ahorro != null) ...[
                const SizedBox(height: 6),
                Align(
                  alignment: Alignment.centerRight,
                  child: TintedBadge(
                      color: _kGreen,
                      child: Text('Ahorras ${_pesos(detalle.ahorro!)}')),
                ),
              ],
              if (errorEnHoja != null) ...[
                const SizedBox(height: 14),
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Icon(Icons.error_outline, size: 16, color: _kRed),
                    const SizedBox(width: 8),
                    Expanded(
                        child: Text(errorEnHoja!,
                            style: const TextStyle(color: _kRed, fontSize: 13))),
                  ],
                ),
              ],
              const SizedBox(height: 20),
              LoadingFilledButton(
                label: 'Reservar y pagar',
                icon: Icons.lock_clock,
                onPressed: () async {
                  try {
                    final reserva = await reventaApi.iniciarCheckout(detalle.id);
                    if (!context.mounted) return;
                    Navigator.pop(context, reserva);
                  } catch (error) {
                    // Aquí es donde aterriza CU-006H: otra persona se adelantó.
                    setHoja(() => errorEnHoja = _texto(error));
                  }
                },
              ),
              const SizedBox(height: 8),
              Text(
                  'Al reservar, la entrada queda apartada para ti unos minutos '
                  'mientras completas el pago.',
                  style: TextStyle(
                      fontSize: 12,
                      color: Theme.of(context)
                          .colorScheme
                          .onSurface
                          .withValues(alpha: 0.6))),
            ],
          ),
        ),
      ),
    );

    if (checkout != null && mounted) await _mostrarReserva(checkout);
    if (mounted) await _cargarMercado();
  }

  /// Comprobante de la compra: las dos SALIDAS que declara el CU-006 —la
  /// confirmación de la transferencia y el nuevo código QR—.
  ///
  /// El QR se muestra aquí mismo porque es lo único que el comprador necesita
  /// para entrar al evento, y porque el correo de confirmación (paso 12) es
  /// asíncrono: puede tardar, y no tiene sentido que la persona se quede sin
  /// nada en la mano mientras llega.
  void _mostrarComprobante(ResultadoCompra compra) {
    activityLog.add(ActivityEntry(
        type: ActivityType.resale,
        title: compra.eventoNombre,
        subtitle: 'Comprada en reventa · ${compra.numeroTicket}',
        amount: compra.precio.round()));

    showModalBottomSheet<void>(
      context: context,
      builder: (context) => Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                const TintedIconBadge(
                    icon: Icons.check_circle, color: _kGreen, size: 40),
                const SizedBox(width: 12),
                Expanded(
                  child: Text('¡Entrada transferida!',
                      style: const TextStyle(
                          fontSize: 20, fontWeight: FontWeight.w600)),
                ),
              ],
            ),
            const SizedBox(height: 16),
            Text(compra.eventoNombre,
                style: const TextStyle(fontWeight: FontWeight.w600)),
            Text('${compra.localidadNombre} · ${compra.numeroTicket}'),
            const SizedBox(height: 16),
            const Text('Tu nuevo código de ingreso',
                style: TextStyle(fontWeight: FontWeight.w600)),
            const SizedBox(height: 6),
            SelectableText(compra.codigoQr,
                style: const TextStyle(
                    fontFamily: 'monospace',
                    fontSize: 15,
                    fontWeight: FontWeight.w600)),
            const SizedBox(height: 6),
            Text(
                'El código anterior quedó anulado: solo este sirve para entrar.',
                style: TextStyle(
                    fontSize: 12,
                    color: Theme.of(context)
                        .colorScheme
                        .onSurface
                        .withValues(alpha: 0.6))),
            const Divider(height: 28),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text('Pagado · ${compra.numeroTransaccion}',
                    style: const TextStyle(fontSize: 12)),
                Text(_pesos(compra.precio),
                    style: const TextStyle(fontWeight: FontWeight.bold)),
              ],
            ),
            const SizedBox(height: 16),
            FilledButton(
                onPressed: () => Navigator.pop(context),
                child: const Text('Listo')),
          ],
        ),
      ),
    );
  }

  /// Muestra la reserva viva, con su cuenta atrás.
  Future<void> _mostrarReserva(Checkout checkout) async {
    await showModalBottomSheet<void>(
      context: context,
      isDismissible: false,
      enableDrag: false,
      builder: (context) => _HojaReserva(
        checkout: checkout,
        onPagado: _mostrarComprobante,
        onCancelar: () async {
          try {
            await reventaApi.cancelarCheckout(checkout.id);
            if (!context.mounted) return;
            Navigator.pop(context);
            _aviso('Reserva cancelada. La entrada vuelve al mercado.');
          } catch (error) {
            if (!context.mounted) return;
            _aviso(_texto(error), exito: false);
          }
        },
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final topInset = kToolbarHeight + MediaQuery.of(context).padding.top + 20;
    return GlassScaffold(
      appBar: const GlassAppBar(title: Text('Reventa de entradas')),
      body: RefreshIndicator(
        onRefresh: _refrescar,
        child: ListView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: EdgeInsets.fromLTRB(16, topInset, 16, 24),
          children: [
            SegmentedButton<bool>(
              segments: const [
                ButtonSegment(
                    value: false,
                    label: Text('Mis entradas'),
                    icon: Icon(Icons.confirmation_number_outlined)),
                ButtonSegment(
                    value: true,
                    label: Text('Mercado'),
                    icon: Icon(Icons.storefront_outlined)),
              ],
              selected: {_market},
              onSelectionChanged: (value) {
                setState(() => _market = value.first);
                if (_market && _mercadoDatos == null) _cargarMercado();
              },
            ),
            const SizedBox(height: 16),
            if (!_market) ..._misEntradas(context) else ..._mercado(context),
          ],
        ),
      ),
    );
  }

  // --- Pestaña "Mis entradas" (conectada al backend) ---------------------

  List<Widget> _misEntradas(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    final scheme = Theme.of(context).colorScheme;

    if (_cargando) {
      return const [
        Padding(
          padding: EdgeInsets.symmetric(vertical: 48),
          child: Center(child: CircularProgressIndicator()),
        )
      ];
    }

    if (_error != null) {
      return [
        Padding(
          padding: const EdgeInsets.symmetric(vertical: 32),
          child: Column(
            children: [
              const TintedIconBadge(icon: Icons.cloud_off, color: _kRed),
              const SizedBox(height: 12),
              Text(_error!,
                  textAlign: TextAlign.center, style: textTheme.bodyMedium),
              const SizedBox(height: 16),
              OutlinedButton.icon(
                  onPressed: _cargar,
                  icon: const Icon(Icons.refresh),
                  label: const Text('Reintentar')),
            ],
          ),
        )
      ];
    }

    final entradas = _entradas ?? const <EntradaPropia>[];
    if (entradas.isEmpty) {
      return [
        Padding(
          padding: const EdgeInsets.symmetric(vertical: 32),
          child: Center(
            child: Text('Todavía no tienes entradas.',
                style: textTheme.bodyMedium?.copyWith(
                    color: scheme.onSurface.withValues(alpha: 0.6))),
          ),
        )
      ];
    }

    return [
      for (final entrada in entradas)
        Padding(
          padding: const EdgeInsets.only(bottom: 12),
          child: Card(
            child: Padding(
              padding: const EdgeInsets.all(14),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      TintedIconBadge(
                          icon: Icons.confirmation_number,
                          color: entrada.estaEnVenta ? _kAmber : _kIndigo),
                      const SizedBox(width: 14),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(entrada.eventoNombre,
                                style: textTheme.titleSmall),
                            Text(
                                '${entrada.localidadNombre} · ${entrada.numeroTicket}',
                                style: const TextStyle(
                                    fontFamily: 'monospace', fontSize: 12)),
                            Text(
                                'Precio original: ${_pesos(entrada.precioOriginal)}',
                                style: textTheme.bodySmall?.copyWith(
                                    color: scheme.onSurface
                                        .withValues(alpha: 0.6))),
                          ],
                        ),
                      ),
                    ],
                  ),
                  if (entrada.estaEnVenta) ...[
                    const SizedBox(height: 10),
                    StatusChip(
                        label: 'En venta · ${_pesos(entrada.publicacion!.precio)}',
                        color: _kAmber,
                        icon: Icons.sell_outlined),
                    const SizedBox(height: 10),
                    Row(
                      children: [
                        Expanded(
                          child: OutlinedButton(
                              onPressed: () =>
                                  _hojaPrecio(entrada, cambiar: true),
                              child: const Text('Cambiar precio')),
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: OutlinedButton(
                              onPressed: () => _retirar(entrada),
                              child: const Text('Retirar')),
                        ),
                      ],
                    ),
                  ] else if (entrada.puedePublicarse) ...[
                    const SizedBox(height: 10),
                    SizedBox(
                      width: double.infinity,
                      child: FilledButton(
                          onPressed: () =>
                              _hojaPrecio(entrada, cambiar: false),
                          child: const Text('Poner en venta')),
                    ),
                  ] else ...[
                    const SizedBox(height: 10),
                    // El motivo lo redacta el backend; la app solo lo muestra.
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const Icon(Icons.block, size: 16, color: _kRed),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text(
                              entrada.detalleBloqueo ??
                                  'Esta entrada no puede revenderse.',
                              style: textTheme.bodySmall?.copyWith(
                                  color: scheme.onSurface
                                      .withValues(alpha: 0.7))),
                        ),
                      ],
                    ),
                  ],
                ],
              ),
            ),
          ),
        ),
    ];
  }

  // --- Pestaña "Mercado" (paso 5 del CU-006, conectada al backend) -------

  List<Widget> _mercado(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    final scheme = Theme.of(context).colorScheme;

    if (_cargandoMercado && _mercadoDatos == null) {
      return const [
        Padding(
          padding: EdgeInsets.symmetric(vertical: 48),
          child: Center(child: CircularProgressIndicator()),
        )
      ];
    }

    if (_errorMercado != null) {
      return [
        Padding(
          padding: const EdgeInsets.symmetric(vertical: 32),
          child: Column(
            children: [
              const TintedIconBadge(icon: Icons.cloud_off, color: _kRed),
              const SizedBox(height: 12),
              Text(_errorMercado!,
                  textAlign: TextAlign.center, style: textTheme.bodyMedium),
              const SizedBox(height: 16),
              OutlinedButton.icon(
                  onPressed: _cargarMercado,
                  icon: const Icon(Icons.refresh),
                  label: const Text('Reintentar')),
            ],
          ),
        )
      ];
    }

    final publicaciones = _mercadoDatos?.publicaciones ?? const <PublicacionMercado>[];

    return [
      Row(
        children: [
          Expanded(
            child: Text(
                publicaciones.isEmpty
                    ? 'Mercado secundario'
                    : '${_mercadoDatos!.total} ${_mercadoDatos!.total == 1 ? "entrada disponible" : "entradas disponibles"}',
                style: textTheme.titleSmall),
          ),
          PopupMenuButton<OrdenMercado>(
            initialValue: _orden,
            tooltip: 'Ordenar',
            icon: const Icon(Icons.sort),
            onSelected: (valor) {
              setState(() => _orden = valor);
              _cargarMercado();
            },
            itemBuilder: (context) => [
              for (final opcion in OrdenMercado.values)
                PopupMenuItem(value: opcion, child: Text(opcion.etiqueta)),
            ],
          ),
        ],
      ),
      const SizedBox(height: 8),
      if (publicaciones.isEmpty)
        Padding(
          padding: const EdgeInsets.symmetric(vertical: 32),
          child: Center(
            child: Text('No hay publicaciones disponibles por ahora.',
                style: textTheme.bodyMedium?.copyWith(
                    color: scheme.onSurface.withValues(alpha: 0.6))),
          ),
        )
      else
        for (final publicacion in publicaciones)
          Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: LiquidGlassCard(
              borderRadius: BorderRadius.circular(24),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      const TintedIconBadge(
                          icon: Icons.storefront_outlined,
                          color: _kIndigo,
                          size: 38),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(publicacion.eventoNombre,
                                style: textTheme.titleSmall),
                            Text(
                                '${publicacion.localidadNombre} · ${publicacion.lugar}',
                                style: textTheme.bodySmall?.copyWith(
                                    color: scheme.onSurface
                                        .withValues(alpha: 0.6))),
                          ],
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  Row(
                    crossAxisAlignment: CrossAxisAlignment.end,
                    children: [
                      Text(_pesos(publicacion.precio),
                          style: textTheme.titleMedium),
                      const SizedBox(width: 8),
                      if (publicacion.precio != publicacion.precioOriginal)
                        Text(_pesos(publicacion.precioOriginal),
                            style: textTheme.bodySmall?.copyWith(
                                decoration: TextDecoration.lineThrough,
                                color:
                                    scheme.onSurface.withValues(alpha: 0.5))),
                      const Spacer(),
                      if (publicacion.ahorro != null)
                        TintedBadge(
                            color: _kGreen,
                            child:
                                Text('Ahorras ${_pesos(publicacion.ahorro!)}'))
                      else
                        const TintedBadge(
                            color: _kAmber, child: Text('Precio de mercado')),
                    ],
                  ),
                  const SizedBox(height: 14),
                  FilledButton.icon(
                      onPressed: () => _abrirPublicacion(publicacion),
                      icon: const Icon(Icons.shopping_bag_outlined),
                      label: const Text('Ver y comprar')),
                ],
              ),
            ),
          ),
    ];
  }
}

/// Hoja de una reserva viva, con la cuenta atrás de lo que le queda.
///
/// La cuenta atrás no es adorno: es la representación visible del TTL del
/// bloqueo en Redis (ADR-03). Si el comprador no termina a tiempo, la entrada
/// vuelve al mercado, y es justo que lo vea venir en lugar de descubrirlo al
/// pulsar "pagar".
///
/// Es un widget propio y no un `StatefulBuilder` porque hace falta un `Timer`,
/// y un temporizador necesita un `dispose()` donde cancelarse. Dejado suelto
/// seguiría disparando después de cerrar la hoja.
class _HojaReserva extends StatefulWidget {
  const _HojaReserva({
    required this.checkout,
    required this.onCancelar,
    required this.onPagado,
  });

  final Checkout checkout;
  final Future<void> Function() onCancelar;
  final void Function(ResultadoCompra) onPagado;

  @override
  State<_HojaReserva> createState() => _HojaReservaState();
}

class _HojaReservaState extends State<_HojaReserva> {
  late int _restantes = widget.checkout.segundosRestantes;
  Timer? _temporizador;
  String _metodo = 'TARJETA';
  String? _error;

  /// Medios de pago de prueba.
  ///
  /// En producción la app tokeniza la tarjeta contra la pasarela y envía el
  /// token resultante: los datos de tarjeta nunca pasan por el backend
  /// (RNF-05). Aquí se eligen tokens del simulador, que decide el resultado
  /// según su prefijo — es lo que permite enseñar los caminos CU-006G y
  /// CU-006I en la app sin tocar el servidor.
  static const _tokensDemo = {
    'tok_ok_demo': 'Pago que se aprueba',
    'tok_rechazo_demo': 'Pago rechazado (CU-006G)',
    'tok_timeout_demo': 'La pasarela no responde (CU-006I)',
  };
  String _token = 'tok_ok_demo';

  @override
  void initState() {
    super.initState();
    _temporizador = Timer.periodic(const Duration(seconds: 1), (timer) {
      if (_restantes <= 0) {
        timer.cancel();
        return;
      }
      setState(() => _restantes--);
    });
  }

  @override
  void dispose() {
    _temporizador?.cancel();
    super.dispose();
  }

  /// mm:ss de lo que queda de reserva.
  String get _cuentaAtras {
    final minutos = (_restantes ~/ 60).toString();
    final segundos = (_restantes % 60).toString().padLeft(2, '0');
    return '$minutos:$segundos';
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final caducada = _restantes <= 0;
    final checkout = widget.checkout;

    return Padding(
      padding: const EdgeInsets.all(24),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(caducada ? 'Reserva caducada' : 'Entrada reservada',
                    style: const TextStyle(
                        fontSize: 20, fontWeight: FontWeight.w600)),
              ),
              StatusChip(
                  label: caducada ? 'Caducada' : _cuentaAtras,
                  color: caducada ? _kRed : _kAmber,
                  icon: Icons.timer_outlined),
            ],
          ),
          const SizedBox(height: 12),
          Text(checkout.publicacion.eventoNombre,
              style: const TextStyle(fontWeight: FontWeight.w600)),
          Text(
              '${checkout.publicacion.localidadNombre} · ${checkout.numeroTransaccion}',
              style: const TextStyle(fontFamily: 'monospace', fontSize: 12)),
          const Divider(height: 24),
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              const Text('Total a pagar'),
              Text(_pesos(checkout.precio),
                  style: const TextStyle(
                      fontSize: 18, fontWeight: FontWeight.bold)),
            ],
          ),
          const SizedBox(height: 20),
          if (caducada)
            Text(
                'La reserva expiró y la entrada volvió al mercado. Puedes intentarlo de nuevo.',
                style: TextStyle(
                    fontSize: 13,
                    color: scheme.onSurface.withValues(alpha: 0.7)))
          else ...[
            DropdownButtonFormField<String>(
              initialValue: _metodo,
              decoration: const InputDecoration(labelText: 'Método de pago'),
              items: const [
                DropdownMenuItem(
                    value: 'TARJETA',
                    child: Text('Tarjeta de crédito o débito')),
                DropdownMenuItem(value: 'PSE', child: Text('PSE')),
              ],
              onChanged: (valor) => setState(() => _metodo = valor!),
            ),
            const SizedBox(height: 8),
            DropdownButtonFormField<String>(
              initialValue: _token,
              decoration: const InputDecoration(
                  labelText: 'Medio de pago de prueba',
                  helperText: 'Solo en desarrollo: elige qué debe responder la pasarela'),
              items: [
                for (final entrada in _tokensDemo.entries)
                  DropdownMenuItem(
                      value: entrada.key, child: Text(entrada.value)),
              ],
              onChanged: (valor) => setState(() => _token = valor!),
            ),
            if (_error != null) ...[
              const SizedBox(height: 12),
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Icon(Icons.error_outline, size: 16, color: _kRed),
                  const SizedBox(width: 8),
                  Expanded(
                      child: Text(_error!,
                          style: const TextStyle(color: _kRed, fontSize: 13))),
                ],
              ),
            ],
            const SizedBox(height: 14),
            LoadingFilledButton(
              label: 'Confirmar pago',
              icon: Icons.lock_outline,
              onPressed: () async {
                try {
                  final compra = await reventaApi.pagar(
                      checkoutId: checkout.id,
                      metodoPago: _metodo,
                      token: _token);
                  if (!context.mounted) return;
                  Navigator.pop(context);
                  widget.onPagado(compra);
                } catch (error) {
                  // Aquí aterrizan CU-006G (rechazado) y CU-006I (sin
                  // respuesta). El texto lo redacta el backend; en el segundo
                  // caso dice explícitamente que no se sabe si hubo cargo, y
                  // eso es justo lo que el comprador necesita leer.
                  setState(() => _error = error is ReventaApiException
                      ? error.mensaje
                      : 'No se pudo conectar con el servidor, intenta de nuevo.');
                }
              },
            ),
          ],
          const SizedBox(height: 10),
          // CU-006C: cancelar libera el bloqueo ya, sin esperar al TTL.
          OutlinedButton(
            onPressed: () async {
              if (caducada) {
                Navigator.pop(context);
                return;
              }
              await widget.onCancelar();
            },
            child: Text(caducada ? 'Cerrar' : 'Cancelar reserva'),
          ),
        ],
      ),
    );
  }
}
