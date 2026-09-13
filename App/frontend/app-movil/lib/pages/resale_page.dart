import 'package:flutter/material.dart';

import '../models/activity_log.dart';
import '../widgets/liquid_glass.dart';

const _kIndigo = Color(0xFF3B5BFF);
const _kGreen = Color(0xFF34D399);
const _kAmber = Color(0xFFFFB020);

// entrada propia que se puede publicar en el mercado
class _MyTicket {
  _MyTicket(this.event, this.code, this.originalPrice);
  final String event;
  final String code;
  final int originalPrice;
  bool forSale = false;
  int? resalePrice;
}

// publicación de otra persona en el mercado
class _MarketListing {
  _MarketListing(this.seller, this.event, this.resalePrice, this.originalPrice);
  final String seller;
  final String event;
  final int resalePrice;
  final int originalPrice;
}

class ResaleMarketplacePage extends StatefulWidget {
  const ResaleMarketplacePage({super.key});
  @override
  State<ResaleMarketplacePage> createState() => _ResaleMarketplacePageState();
}

class _ResaleMarketplacePageState extends State<ResaleMarketplacePage> {
  bool _market = false;

  final _mine = [
    _MyTicket('HEXACORE Fest 2026', 'HXC-QR-000123', 180000),
    _MyTicket('Noche de Rock Nacional', 'HXC-QR-000124', 95000),
  ];

  final _listings = [
    _MarketListing('Camila Rodríguez', 'Feria Gastronómica', 35000, 40000),
    _MarketListing('Julián Restrepo', 'Comedia en Vivo', 30000, 35000),
    _MarketListing('Valentina Ortiz', 'Maratón HEXACORE 10K', 18000, 20000),
  ];

  void _publish(_MyTicket ticket) {
    final controller =
        TextEditingController(text: ticket.originalPrice.toString());
    showModalBottomSheet(
      context: context,
      builder: (context) => Padding(
        padding: EdgeInsets.only(
            left: 24,
            right: 24,
            top: 24,
            bottom: MediaQuery.of(context).viewInsets.bottom + 24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text('Publicar ${ticket.event}',
                style:
                    const TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
            const SizedBox(height: 4),
            Text('Precio original: \$${ticket.originalPrice}'),
            const SizedBox(height: 16),
            TextField(
              controller: controller,
              keyboardType: TextInputType.number,
              decoration: const InputDecoration(labelText: 'Precio de reventa'),
            ),
            const SizedBox(height: 16),
            LoadingFilledButton(
              label: 'Publicar',
              onPressed: () async {
                final value = int.tryParse(controller.text.trim()) ??
                    ticket.originalPrice;
                await Future.delayed(const Duration(milliseconds: 700));
                if (!context.mounted) return;
                Navigator.pop(context);
                setState(() {
                  ticket.forSale = true;
                  ticket.resalePrice = value;
                });
                activityLog.add(ActivityEntry(
                    type: ActivityType.resale,
                    title: ticket.event,
                    subtitle: 'Publicada en reventa · ${ticket.code}',
                    amount: value));
              },
            ),
          ],
        ),
      ),
    );
  }

  void _buy(_MarketListing listing) {
    var method = 'Tarjeta de crédito o débito';
    showModalBottomSheet(
      context: context,
      builder: (context) => StatefulBuilder(
        builder: (context, setSheetState) => Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Text('Resumen de la compra',
                  style: TextStyle(fontSize: 20, fontWeight: FontWeight.w600)),
              const SizedBox(height: 12),
              Text('${listing.event} · Vendedor: ${listing.seller}'),
              const Divider(),
              Text('Total: \$${listing.resalePrice}',
                  style: const TextStyle(
                      fontSize: 18, fontWeight: FontWeight.bold)),
              DropdownButtonFormField<String>(
                initialValue: method,
                decoration: const InputDecoration(labelText: 'Método de pago'),
                items: const [
                  DropdownMenuItem(
                      value: 'Tarjeta de crédito o débito',
                      child: Text('Tarjeta de crédito o débito')),
                  DropdownMenuItem(value: 'PSE', child: Text('PSE')),
                ],
                onChanged: (value) => setSheetState(() => method = value!),
              ),
              const SizedBox(height: 8),
              LoadingFilledButton(
                label: 'Confirmar pago',
                onPressed: () async {
                  await Future.delayed(const Duration(milliseconds: 800));
                  if (!context.mounted) return;
                  Navigator.pop(context);
                  setState(() => _listings.remove(listing));
                  activityLog.add(ActivityEntry(
                      type: ActivityType.resale,
                      title: listing.event,
                      subtitle: 'Comprada a ${listing.seller} (reventa)',
                      amount: listing.resalePrice));
                  ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
                      content: Text('¡Compra exitosa! Revisa tus entradas.')));
                },
              ),
            ],
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    final scheme = Theme.of(context).colorScheme;
    return GlassScaffold(
      appBar: const GlassAppBar(title: Text('Reventa de entradas')),
      body: ListView(
        padding: EdgeInsets.fromLTRB(16,
            kToolbarHeight + MediaQuery.of(context).padding.top + 20, 16, 24),
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
            onSelectionChanged: (value) =>
                setState(() => _market = value.first),
          ),
          const SizedBox(height: 16),
          if (!_market)
            for (final ticket in _mine)
              Padding(
                padding: const EdgeInsets.only(bottom: 12),
                child: Card(
                  child: Padding(
                    padding: const EdgeInsets.all(14),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const TintedIconBadge(
                            icon: Icons.confirmation_number, color: _kIndigo),
                        const SizedBox(width: 14),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(ticket.event, style: textTheme.titleSmall),
                              Text(ticket.code,
                                  style: const TextStyle(
                                      fontFamily: 'monospace', fontSize: 12)),
                              Text('Precio original: \$${ticket.originalPrice}',
                                  style: textTheme.bodySmall?.copyWith(
                                      color: scheme.onSurface
                                          .withValues(alpha: 0.6))),
                              if (ticket.forSale) ...[
                                const SizedBox(height: 8),
                                StatusChip(
                                    label: 'En venta · \$${ticket.resalePrice}',
                                    color: _kAmber,
                                    icon: Icons.sell_outlined),
                              ],
                            ],
                          ),
                        ),
                        const SizedBox(width: 8),
                        ticket.forSale
                            ? OutlinedButton(
                                onPressed: () =>
                                    setState(() => ticket.forSale = false),
                                child: const Text('Cancelar'))
                            : FilledButton(
                                onPressed: () => _publish(ticket),
                                child: const Text('Poner en venta')),
                      ],
                    ),
                  ),
                ),
              )
          else if (_listings.isEmpty)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 32),
              child: Center(
                child: Text('No hay publicaciones disponibles por ahora.',
                    style: textTheme.bodyMedium?.copyWith(
                        color: scheme.onSurface.withValues(alpha: 0.6))),
              ),
            )
          else
            for (final listing in _listings)
              Padding(
                padding: const EdgeInsets.only(bottom: 12),
                child: LiquidGlassCard(
                  borderRadius: BorderRadius.circular(24),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          CircleAvatar(
                              radius: 18,
                              backgroundColor:
                                  scheme.primary.withValues(alpha: 0.22),
                              child: Text(listing.seller.substring(0, 1),
                                  style: TextStyle(
                                      color: scheme.primary,
                                      fontWeight: FontWeight.w700))),
                          const SizedBox(width: 10),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(listing.event,
                                    style: textTheme.titleSmall),
                                Text(listing.seller,
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
                          Text('\$${listing.resalePrice}',
                              style: textTheme.titleMedium),
                          const SizedBox(width: 8),
                          if (listing.resalePrice != listing.originalPrice)
                            Text('\$${listing.originalPrice}',
                                style: textTheme.bodySmall?.copyWith(
                                    decoration: TextDecoration.lineThrough,
                                    color: scheme.onSurface
                                        .withValues(alpha: 0.5))),
                          const Spacer(),
                          if (listing.resalePrice < listing.originalPrice)
                            TintedBadge(
                                color: _kGreen,
                                child: Text(
                                    'Ahorras \$${listing.originalPrice - listing.resalePrice}'))
                          else
                            const TintedBadge(
                                color: _kAmber,
                                child: Text('Precio de mercado')),
                        ],
                      ),
                      const SizedBox(height: 14),
                      FilledButton.icon(
                          onPressed: () => _buy(listing),
                          icon: const Icon(Icons.shopping_bag_outlined),
                          label: const Text('Comprar')),
                    ],
                  ),
                ),
              ),
        ],
      ),
    );
  }
}
