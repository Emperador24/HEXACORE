import 'package:flutter/material.dart';

import '../widgets/liquid_glass.dart';

class _NotificationItem {
  _NotificationItem({
    required this.icon,
    required this.color,
    required this.title,
    required this.description,
    required this.time,
    this.unread = true,
  });

  final IconData icon;
  final Color color;
  final String title;
  final String description;
  final String time;
  bool unread;
}

// centro de notificaciones, lista local en memoria
class NotificationsPage extends StatefulWidget {
  const NotificationsPage({super.key});

  @override
  State<NotificationsPage> createState() => _NotificationsPageState();
}

class _NotificationsPageState extends State<NotificationsPage> {
  final _items = [
    _NotificationItem(
      icon: Icons.schedule_outlined,
      color: const Color(0xFF3B5BFF),
      title: 'Cambio de turno confirmado',
      description:
          'Tu turno del 20 sep se movió a Zona de Parqueadero, 5:00 p. m.',
      time: 'Hace 5 min',
    ),
    _NotificationItem(
      icon: Icons.report_outlined,
      color: const Color(0xFFFFB020),
      title: 'Incidente en Puerta Norte',
      description:
          'Fila desbordada reportada; se reforzó con un carril adicional.',
      time: 'Hace 40 min',
    ),
    _NotificationItem(
      icon: Icons.warning_amber_rounded,
      color: const Color(0xFFFF5A5F),
      title: 'Alerta de emergencia',
      description: 'Protocolo de evacuación activado en Movistar Arena.',
      time: 'Ayer',
    ),
    _NotificationItem(
      icon: Icons.confirmation_number_outlined,
      color: const Color(0xFF34D399),
      title: 'Compra de entrada confirmada',
      description: 'Tu entrada para HEXACORE Fest 2026 ya está disponible.',
      time: 'Ayer',
      unread: false,
    ),
    _NotificationItem(
      icon: Icons.sell_outlined,
      color: const Color(0xFF34D399),
      title: 'Tu entrada se vendió',
      description:
          'Alguien compró tu entrada de Feria Gastronómica en el mercado de reventa.',
      time: 'Hace 2 días',
      unread: false,
    ),
  ];

  int get _unreadCount => _items.where((i) => i.unread).length;

  void _markAllRead() => setState(() {
        for (final item in _items) {
          item.unread = false;
        }
      });

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final textTheme = Theme.of(context).textTheme;
    return GlassScaffold(
      appBar: GlassAppBar(
        title: const Text('Notificaciones'),
        actions: [
          if (_unreadCount > 0)
            TextButton(
              onPressed: _markAllRead,
              child: const Text('Marcar todas como leídas'),
            ),
        ],
      ),
      body: ListView.separated(
        padding: EdgeInsets.fromLTRB(16,
            kToolbarHeight + MediaQuery.of(context).padding.top + 16, 16, 16),
        itemCount: _items.length,
        separatorBuilder: (_, __) => const SizedBox(height: 10),
        itemBuilder: (context, i) {
          final item = _items[i];
          return InkWell(
            borderRadius: BorderRadius.circular(20),
            onTap: () => setState(() => item.unread = false),
            child: Container(
              padding: const EdgeInsets.all(14),
              decoration: BoxDecoration(
                borderRadius: BorderRadius.circular(20),
                color: scheme.surface.withValues(alpha: 0.35),
                border: Border.all(
                    color: scheme.outlineVariant.withValues(alpha: 0.3)),
              ),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  TintedIconBadge(icon: item.icon, color: item.color),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(item.title, style: textTheme.titleSmall),
                        const SizedBox(height: 2),
                        Text(item.description, style: textTheme.bodySmall),
                        const SizedBox(height: 6),
                        Text(item.time,
                            style: textTheme.bodySmall?.copyWith(
                                color:
                                    scheme.onSurface.withValues(alpha: 0.5))),
                      ],
                    ),
                  ),
                  if (item.unread)
                    Container(
                      margin: const EdgeInsets.only(top: 4, left: 6),
                      width: 8,
                      height: 8,
                      decoration: const BoxDecoration(
                          color: Color(0xFFFF5A5F), shape: BoxShape.circle),
                    ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }
}
