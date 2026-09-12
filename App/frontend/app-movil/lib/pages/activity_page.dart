import 'package:flutter/material.dart';

import '../models/activity_log.dart';
import '../widgets/liquid_glass.dart';

const _kIndigo = Color(0xFF3B5BFF);
const _kCyan = Color(0xFF22D3EE);
const _kAmber = Color(0xFFFFB020);
const _kGreen = Color(0xFF34D399);
const _kRed = Color(0xFFFF5A5F);

(IconData, Color) _styleFor(ActivityType type) => switch (type) {
      ActivityType.ticket => (Icons.confirmation_number_outlined, _kIndigo),
      ActivityType.parking => (Icons.local_parking_outlined, _kCyan),
      ActivityType.order => (Icons.restaurant_outlined, _kAmber),
      ActivityType.resale => (Icons.sell_outlined, _kGreen),
      ActivityType.attendance => (Icons.how_to_reg_outlined, _kGreen),
      ActivityType.shiftChange => (Icons.swap_horiz, _kAmber),
      ActivityType.cancellation => (Icons.cancel_outlined, _kRed),
    };

String _relativeTime(DateTime time) {
  final diff = DateTime.now().difference(time);
  if (diff.inMinutes < 1) return 'Justo ahora';
  if (diff.inMinutes < 60) return 'Hace ${diff.inMinutes} min';
  if (diff.inHours < 24) return 'Hace ${diff.inHours} h';
  return 'Hace ${diff.inDays} d';
}

// historial de entradas, parqueadero, pedidos y reventa
class ActivityPage extends StatelessWidget {
  const ActivityPage({super.key});

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    final scheme = Theme.of(context).colorScheme;
    return GlassScaffold(
      appBar: const GlassAppBar(title: Text('Mi actividad')),
      body: AnimatedBuilder(
        animation: activityLog,
        builder: (context, _) {
          final entries = activityLog.entries;
          if (entries.isEmpty) {
            return Center(
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 32),
                child: Text(
                  'Aún no tienes actividad. Compra una entrada, reserva parqueadero, '
                  'haz un pedido o publica una reventa para verla aquí.',
                  textAlign: TextAlign.center,
                  style: textTheme.bodyMedium?.copyWith(
                      color: scheme.onSurface.withValues(alpha: 0.6)),
                ),
              ),
            );
          }
          return ListView.separated(
            padding: EdgeInsets.fromLTRB(
                16,
                kToolbarHeight + MediaQuery.of(context).padding.top + 20,
                16,
                24),
            itemCount: entries.length,
            separatorBuilder: (_, __) => const SizedBox(height: 10),
            itemBuilder: (context, i) {
              final entry = entries[i];
              final (icon, color) = _styleFor(entry.type);
              return Card(
                child: Padding(
                  padding: const EdgeInsets.all(14),
                  child: Row(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      TintedIconBadge(icon: icon, color: color),
                      const SizedBox(width: 14),
                      Expanded(
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Text(entry.title, style: textTheme.titleSmall),
                            Text(entry.subtitle,
                                style: textTheme.bodySmall?.copyWith(
                                    color: scheme.onSurface
                                        .withValues(alpha: 0.6))),
                            const SizedBox(height: 4),
                            Text(_relativeTime(entry.timestamp),
                                style: textTheme.bodySmall?.copyWith(
                                    color: scheme.onSurface
                                        .withValues(alpha: 0.45))),
                          ],
                        ),
                      ),
                      if (entry.amount > 0) ...[
                        const SizedBox(width: 8),
                        Text('\$${entry.amount}', style: textTheme.titleSmall),
                      ],
                    ],
                  ),
                ),
              );
            },
          );
        },
      ),
    );
  }
}
