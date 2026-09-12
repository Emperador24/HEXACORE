import 'package:flutter/foundation.dart';

// tipo de movimiento, define el ícono y color en ActivityPage
enum ActivityType {
  ticket,
  parking,
  order,
  resale,
  attendance,
  shiftChange,
  cancellation
}

class ActivityEntry {
  ActivityEntry({
    required this.type,
    required this.title,
    required this.subtitle,
    required this.amount,
  }) : timestamp = DateTime.now();

  final ActivityType type;
  final String title;
  final String subtitle;
  final int amount;
  final DateTime timestamp;
}

// historial de compras/reservas/ventas, en memoria durante la sesión
class ActivityLog extends ChangeNotifier {
  final List<ActivityEntry> _entries = [];

  List<ActivityEntry> get entries => List.unmodifiable(_entries.reversed);

  void add(ActivityEntry entry) {
    _entries.add(entry);
    notifyListeners();
  }
}

final activityLog = ActivityLog();
