import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hexacore_app/pages/parking_page.dart';
import 'package:hexacore_app/services/parqueadero_api.dart';

/// Lo que respondería el servidor: una zona solo de automóviles y otra con motos.
class _ApiFalsa extends ParqueaderoApi {
  _ApiFalsa({this.eventoHoy = false, List<Map<String, dynamic>>? mias}) : mias = mias ?? [];
  final bool eventoHoy;
  final List<Map<String, dynamic>> mias;
  final reservas = <Map<String, Object>>[];
  final canceladas = <String>[];

  @override
  Future<List<EventoCartelera>> eventosProximos() async => [
        EventoCartelera(id: 'e1', nombre: 'Noche de Rock Nacional', lugar: 'Movistar Arena', ciudad: 'Bogotá', fechaInicio: DateTime(2027)),
      ];

  @override
  Future<List<Map<String, dynamic>>> misReservas() async => mias;

  @override
  Future<Map<String, dynamic>> cancelar(String reservaId) async {
    canceladas.add(reservaId);
    return {'mensaje': 'Reserva cancelada. Se devolvieron 25000 COP a tu medio de pago.'};
  }

  @override
  Future<Map<String, dynamic>> disponibilidad(String eventoId) async => {
        'cancelacion': eventoHoy
            ? {'conDevolucion': false, 'mensaje': 'El evento es hoy: esta reserva no se puede cancelar ni tiene devolución.'}
            : {'conDevolucion': true, 'mensaje': 'Puedes cancelarla con devolución completa hasta el día anterior al evento.'},
        'reservable': true,
        'precio': 25000,
        'horas': 5,
        'minutosParaPagar': 10,
        'zonas': [
          {'id': 'z1', 'nombre': 'Cubierta', 'disponibles': {'AUTOMOVIL': 6, 'MOTO': 0, 'DISCAPACIDAD': 0}},
          {'id': 'z2', 'nombre': 'Descubierta', 'disponibles': {'AUTOMOVIL': 7, 'MOTO': 2, 'DISCAPACIDAD': 1}},
        ],
        'formatosPlaca': {
          'AUTOMOVIL': {'patron': r'^[A-Z]{3}[0-9]{3}$', 'ejemplo': 'ABC123', 'descripcion': 'tres letras y tres números'},
          'MOTO': {'patron': r'^[A-Z]{3}[0-9]{2}[A-Z]$', 'ejemplo': 'ABC12D', 'descripcion': 'tres letras, dos números y una letra'},
          'DISCAPACIDAD': {'patron': r'^[A-Z]{3}[0-9]{3}$', 'ejemplo': 'ABC123', 'descripcion': 'tres letras y tres números'},
        },
      };

  @override
  Future<Map<String, dynamic>> reservar(String eventoId, {required String zonaId, required String placa, required String tipoVehiculo}) async {
    reservas.add({'zonaId': zonaId, 'placa': placa, 'tipoVehiculo': tipoVehiculo});
    throw ParqueaderoApiException('detenido en la prueba');
  }
}

Future<void> avanzar(WidgetTester tester) async {
  for (var i = 0; i < 6; i++) {
    await tester.pump(const Duration(milliseconds: 100));
  }
}

Future<void> elegirTipo(WidgetTester tester, String etiqueta) async {
  await tester.tap(find.text('Automóvil').last);
  await avanzar(tester);
  await tester.tap(find.text(etiqueta).last);
  await avanzar(tester);
}

void main() {
  testWidgets('CU-021: el total libre y la placa dependen del tipo de vehículo', (tester) async {
    tester.view.physicalSize = const Size(1080, 3200);
    tester.view.devicePixelRatio = 2;
    addTearDown(tester.view.reset);
    final api = _ApiFalsa();
    await tester.pumpWidget(MaterialApp(home: Scaffold(body: ParkingPage(api: api))));
    await avanzar(tester);

    expect(find.text('13 espacios libres para automóvil en total.'), findsOneWidget);

    // Una placa de carro sirve para automóvil.
    await tester.enterText(find.byType(TextField), 'abc-123');
    await avanzar(tester);
    expect(find.textContaining('No es una placa'), findsNothing);

    // Como moto, solo cuentan los espacios de moto y la misma placa ya no sirve.
    await elegirTipo(tester, 'Moto');
    expect(find.text('2 espacios libres para moto en total.'), findsOneWidget);
    expect(find.textContaining('No es una placa de moto válida'), findsOneWidget);
    final boton = find.widgetWithText(FilledButton, 'Reservar y pagar');
    expect(tester.widget<FilledButton>(boton).onPressed, isNull);

    // Con placa de moto: antes de reservar se confirman los datos.
    await tester.enterText(find.byType(TextField), 'abc12d');
    await avanzar(tester);
    await tester.tap(boton);
    await avanzar(tester);
    expect(find.text('Revisa los datos'), findsOneWidget);
    expect(find.descendant(of: find.byType(AlertDialog), matching: find.text('ABC12D')), findsOneWidget);

    // «Corregir» no reserva nada.
    await tester.tap(find.text('Corregir'));
    await avanzar(tester);
    expect(api.reservas, isEmpty);

    // Confirmado: se envía la placa normalizada, el tipo y la zona que sí tiene motos.
    await tester.tap(boton);
    await avanzar(tester);
    await tester.tap(find.text('Sí, la placa es correcta'));
    await avanzar(tester);
    expect(api.reservas.single, {'zonaId': 'z2', 'placa': 'ABC12D', 'tipoVehiculo': 'MOTO'});
  });

  testWidgets('el mismo día del evento se avisa antes de pagar que no hay devolución', (tester) async {
    tester.view.physicalSize = const Size(1080, 3200);
    tester.view.devicePixelRatio = 2;
    addTearDown(tester.view.reset);
    final api = _ApiFalsa(eventoHoy: true);
    await tester.pumpWidget(MaterialApp(home: Scaffold(body: ParkingPage(api: api))));
    await avanzar(tester);
    expect(find.text('El evento es hoy: esta reserva no se puede cancelar ni tiene devolución.'), findsOneWidget);

    await tester.enterText(find.byType(TextField), 'ABC123');
    await avanzar(tester);
    await tester.tap(find.widgetWithText(FilledButton, 'Reservar y pagar'));
    await avanzar(tester);
    expect(
        find.descendant(of: find.byType(AlertDialog), matching: find.textContaining('no podrás cancelar esta reserva ni recibir devolución')),
        findsOneWidget);
  });

  testWidgets('una reserva pagada se cancela tras confirmar; el botón solo sale si el servidor lo permite', (tester) async {
    tester.view.physicalSize = const Size(1080, 3200);
    tester.view.devicePixelRatio = 2;
    addTearDown(tester.view.reset);
    Map<String, dynamic> reserva(String id, bool permitida) => {
          'id': id, 'estado': 'CONFIRMADA', 'placa': 'ABC123', 'tipoVehiculo': 'AUTOMOVIL', 'zona': 'Cubierta', 'espacio': 'C-01',
          'monto': 25000, 'codigoQr': 'HXP-$id', 'expiraEn': '2027-01-01T00:00:00Z', 'evento': {'nombre': 'Noche de Rock Nacional'},
          'cancelacion': {'permitida': permitida, 'conDevolucion': permitida, 'mensaje': permitida ? 'Puedes cancelarla.' : 'El evento es hoy.'},
        };
    final api = _ApiFalsa(mias: [reserva('r1', true), reserva('r2', false)]);
    await tester.pumpWidget(MaterialApp(home: Scaffold(body: ParkingPage(api: api))));
    await avanzar(tester);

    // Solo la que el servidor permite cancelar tiene botón.
    expect(find.text('Cancelar reserva'), findsOneWidget);
    await tester.tap(find.text('Cancelar reserva'));
    await avanzar(tester);
    expect(find.text('Se te devuelven \$25000 y el QR deja de servir.'), findsOneWidget);

    await tester.tap(find.text('No'));
    await avanzar(tester);
    expect(api.canceladas, isEmpty);

    await tester.tap(find.text('Cancelar reserva'));
    await avanzar(tester);
    await tester.tap(find.text('Sí, cancelar'));
    await avanzar(tester);
    expect(api.canceladas, ['r1']);
    expect(find.text('Reserva cancelada. Se devolvieron 25000 COP a tu medio de pago.'), findsOneWidget);
  });
}
