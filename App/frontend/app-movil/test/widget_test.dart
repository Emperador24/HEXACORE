import 'package:flutter_test/flutter_test.dart';
import 'package:hexacore_cliente/main.dart';

void main() {
  testWidgets('muestra el formulario de inicio de sesión', (tester) async {
    await tester.pumpWidget(const HexacoreApp());

    expect(find.text('HEXACORE'), findsOneWidget);
    expect(find.text('Ingresar'), findsOneWidget);
  });
}
