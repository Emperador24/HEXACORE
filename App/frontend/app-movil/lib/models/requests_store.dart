import 'package:flutter/foundation.dart';

enum RequestStatus { pending, approved, rejected }

class CancellationRequest {
  CancellationRequest({
    required this.eventName,
    required this.ticketCode,
    required this.reason,
  }) : timestamp = DateTime.now();

  final String eventName;
  final String ticketCode;
  final String reason;
  final DateTime timestamp;
  RequestStatus status = RequestStatus.pending;
}

class ShiftChangeRequest {
  ShiftChangeRequest({
    required this.employeeName,
    required this.currentShift,
    required this.desiredShift,
    required this.reason,
  }) : timestamp = DateTime.now();

  final String employeeName;
  final String currentShift;
  final String desiredShift;
  final String reason;
  final DateTime timestamp;
  RequestStatus status = RequestStatus.pending;
}

class PromoCode {
  PromoCode({
    required this.code,
    required this.discountPercent,
    this.eventId,
  });

  final String code;
  final int discountPercent;
  final String? eventId; // null = aplica a todos los eventos
  bool active = true;
}

// cola compartida de solicitudes y códigos promo: como no hay backend, esto
// permite que un Cliente/Personal envíe una solicitud y que el Jefe de
// personal la vea y resuelva desde otra sesión de login en el mismo
// dispositivo, igual que ya hace `activityLog` con el historial.
class RequestsStore extends ChangeNotifier {
  final List<CancellationRequest> cancellations = [];
  final List<ShiftChangeRequest> shiftChanges = [];
  final List<PromoCode> promoCodes = [];

  void submitCancellation(CancellationRequest request) {
    cancellations.add(request);
    notifyListeners();
  }

  void resolveCancellation(CancellationRequest request, bool approved) {
    request.status = approved ? RequestStatus.approved : RequestStatus.rejected;
    notifyListeners();
  }

  void submitShiftChange(ShiftChangeRequest request) {
    shiftChanges.add(request);
    notifyListeners();
  }

  void resolveShiftChange(ShiftChangeRequest request, bool approved) {
    request.status = approved ? RequestStatus.approved : RequestStatus.rejected;
    notifyListeners();
  }

  void createPromoCode(PromoCode promo) {
    promoCodes.add(promo);
    notifyListeners();
  }

  void togglePromoCode(PromoCode promo) {
    promo.active = !promo.active;
    notifyListeners();
  }

  PromoCode? validatePromo(String code, String eventId) {
    final upper = code.trim().toUpperCase();
    for (final promo in promoCodes) {
      if (promo.code.toUpperCase() == upper &&
          promo.active &&
          (promo.eventId == null || promo.eventId == eventId)) {
        return promo;
      }
    }
    return null;
  }
}

final requestsStore = RequestsStore();
