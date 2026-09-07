import 'package:flutter/material.dart';

void main() => runApp(const HexacoreApp());

const _primary = Color(0xff4f46e5);

class User {
  const User(this.name, this.email, this.role, {this.position});
  final String name;
  final String email;
  final String role;
  final String? position;
}

class Event {
  const Event(this.id, this.name, this.date, this.place, this.price,
      {this.past = false});
  final String id, name, date, place;
  final int price;
  final bool past;
}

class Product {
  const Product(this.name, this.price, {this.available = true});
  final String name;
  final int price;
  final bool available;
}

const _events = [
  Event('evt-1', 'HEXACORE Fest 2026', '12 dic 2026', 'Movistar Arena, Bogotá',
      180000),
  Event('evt-2', 'Noche de Rock Nacional', '20 sep 2026',
      'Coliseo El Campín, Bogotá', 95000),
  Event(
      'evt-3', 'Feria Gastronómica', '5 oct 2026', 'Corferias, Bogotá', 40000),
  Event('evt-4', 'Festival de Verano 2026', '15 jun 2026',
      'Parque Simón Bolívar, Bogotá', 65000,
      past: true),
];

const _accounts = {
  'cliente@hexacore.com': User('Ana Torres', 'cliente@hexacore.com', 'Cliente'),
  'personal@hexacore.com': User(
      'Luis Ramírez', 'personal@hexacore.com', 'Personal',
      position: 'Entrada'),
  'parqueadero@hexacore.com': User(
      'Marta Gómez', 'parqueadero@hexacore.com', 'Personal',
      position: 'Parqueadero'),
  'restaurante@hexacore.com': User(
      'Carlos Peña', 'restaurante@hexacore.com', 'Personal',
      position: 'Restaurante'),
  'jefepersonal@hexacore.com': User(
      'Isabel Rojas', 'jefepersonal@hexacore.com', 'Personal',
      position: 'Jefe de personal'),
};

class HexacoreApp extends StatefulWidget {
  const HexacoreApp({super.key});
  @override
  State<HexacoreApp> createState() => _HexacoreAppState();
}

class _HexacoreAppState extends State<HexacoreApp> {
  User? _user;
  bool _dark = false;

  @override
  Widget build(BuildContext context) {
    final scheme = ColorScheme.fromSeed(
        seedColor: _primary,
        brightness: _dark ? Brightness.dark : Brightness.light);
    return MaterialApp(
      title: 'HEXACORE',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(colorScheme: scheme, useMaterial3: true),
      home: _user == null
          ? LoginPage(onLogin: (user) => setState(() => _user = user))
          : _user!.role == 'Cliente'
              ? ClientShell(
                  user: _user!,
                  dark: _dark,
                  onDarkChanged: (value) => setState(() => _dark = value),
                  onLogout: () => setState(() => _user = null))
              : StaffShell(
                  user: _user!,
                  dark: _dark,
                  onDarkChanged: (value) => setState(() => _dark = value),
                  onLogout: () => setState(() => _user = null)),
    );
  }
}

class LoginPage extends StatefulWidget {
  const LoginPage({super.key, required this.onLogin});
  final ValueChanged<User> onLogin;
  @override
  State<LoginPage> createState() => _LoginPageState();
}

class _LoginPageState extends State<LoginPage> {
  final _email = TextEditingController(text: 'cliente@hexacore.com');
  final _password = TextEditingController(text: '1234');
  String? _error;
  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  void _submit() {
    final user = _password.text == '1234'
        ? _accounts[_email.text.trim().toLowerCase()]
        : null;
    if (user == null) {
      setState(() => _error = 'Correo o contraseña inválidos.');
      return;
    }
    widget.onLogin(user);
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        body: SafeArea(
            child: Center(
                child: SingleChildScrollView(
                    child: Padding(
          padding: const EdgeInsets.all(28),
          child: Card(
              child: Padding(
                  padding: const EdgeInsets.all(24),
                  child: Column(
                      mainAxisSize: MainAxisSize.min,
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        const Icon(Icons.hexagon_rounded,
                            color: _primary, size: 64),
                        const SizedBox(height: 12),
                        Text('HEXACORE',
                            textAlign: TextAlign.center,
                            style: Theme.of(context)
                                .textTheme
                                .headlineMedium
                                ?.copyWith(fontWeight: FontWeight.bold)),
                        const SizedBox(height: 28),
                        TextField(
                            controller: _email,
                            keyboardType: TextInputType.emailAddress,
                            decoration: const InputDecoration(
                                labelText: 'Correo',
                                border: OutlineInputBorder())),
                        const SizedBox(height: 14),
                        TextField(
                            controller: _password,
                            obscureText: true,
                            onSubmitted: (_) => _submit(),
                            decoration: const InputDecoration(
                                labelText: 'Contraseña',
                                border: OutlineInputBorder())),
                        if (_error != null)
                          Padding(
                              padding: const EdgeInsets.only(top: 10),
                              child: Text(_error!,
                                  style: const TextStyle(color: Colors.red))),
                        const SizedBox(height: 20),
                        FilledButton(
                            onPressed: _submit, child: const Text('Ingresar')),
                        const SizedBox(height: 10),
                        Text('Datos de demostración · contraseña: 1234',
                            textAlign: TextAlign.center,
                            style: Theme.of(context).textTheme.bodySmall),
                      ]))),
        )))),
      );
}

class ClientShell extends StatefulWidget {
  const ClientShell(
      {super.key,
      required this.user,
      required this.dark,
      required this.onDarkChanged,
      required this.onLogout});
  final User user;
  final bool dark;
  final ValueChanged<bool> onDarkChanged;
  final VoidCallback onLogout;
  @override
  State<ClientShell> createState() => _ClientShellState();
}

class _ClientShellState extends State<ClientShell> {
  int _tab = 0;
  final List<Order> _orders = [
    Order('Food Truck La Sazón', ['2x Hamburguesa', '1x Gaseosa'], 58000,
        'En preparación')
  ];
  @override
  Widget build(BuildContext context) {
    final pages = [
      EventsPage(onOpen: _openTickets),
      const ParkingPage(),
      OrdersPage(orders: _orders, onNewOrder: _openRestaurants)
    ];
    final titles = ['Eventos', 'Parqueadero', 'Pedidos'];
    return Scaffold(
      appBar: AppBar(title: Text(titles[_tab])),
      drawer: AppDrawer(
          user: widget.user,
          dark: widget.dark,
          onDarkChanged: widget.onDarkChanged,
          onLogout: widget.onLogout),
      body: pages[_tab],
      bottomNavigationBar: NavigationBar(
          selectedIndex: _tab,
          onDestinationSelected: (i) => setState(() => _tab = i),
          destinations: const [
            NavigationDestination(
                icon: Icon(Icons.home_outlined),
                selectedIcon: Icon(Icons.home),
                label: 'Inicio'),
            NavigationDestination(
                icon: Icon(Icons.local_parking_outlined),
                selectedIcon: Icon(Icons.local_parking),
                label: 'Parqueadero'),
            NavigationDestination(
                icon: Icon(Icons.restaurant_outlined),
                selectedIcon: Icon(Icons.restaurant),
                label: 'Pedidos'),
          ]),
    );
  }

  void _openTickets(Event event) => Navigator.of(context)
      .push(MaterialPageRoute(builder: (_) => TicketsPage(event: event)));
  void _openRestaurants() => Navigator.of(context).push(MaterialPageRoute(
      builder: (_) => RestaurantsPage(
          onPaid: (order) => setState(() => _orders.insert(0, order)))));
}

class AppDrawer extends StatelessWidget {
  const AppDrawer(
      {super.key,
      required this.user,
      required this.dark,
      required this.onDarkChanged,
      required this.onLogout});
  final User user;
  final bool dark;
  final ValueChanged<bool> onDarkChanged;
  final VoidCallback onLogout;
  @override
  Widget build(BuildContext context) => Drawer(
          child: ListView(children: [
        UserAccountsDrawerHeader(
            accountName: Text(user.name),
            accountEmail: Text(user.email),
            currentAccountPicture:
                CircleAvatar(child: Text(user.name.substring(0, 1))),
            decoration: const BoxDecoration(color: _primary)),
        ListTile(
          leading: const Icon(Icons.person_outline),
          title: const Text('Perfil'),
          onTap: () => Navigator.of(context)
              .push(MaterialPageRoute(builder: (_) => ProfilePage(user: user))),
        ),
        ListTile(
            leading: const Icon(Icons.settings_outlined),
            title: const Text('Ajustes'),
            onTap: () => Navigator.of(context).push(MaterialPageRoute(
                builder: (_) => SettingsPage(
                    dark: dark,
                    onDarkChanged: onDarkChanged,
                    onLogout: onLogout)))),
        SwitchListTile(
            secondary: const Icon(Icons.dark_mode_outlined),
            title: const Text('Modo oscuro'),
            value: dark,
            onChanged: onDarkChanged),
        const Divider(),
        ListTile(
            leading: const Icon(Icons.logout),
            title: const Text('Cerrar sesión'),
            onTap: onLogout),
      ]));
}

class EventsPage extends StatelessWidget {
  const EventsPage({super.key, required this.onOpen});
  final ValueChanged<Event> onOpen;
  @override
  Widget build(BuildContext context) =>
      ListView(padding: const EdgeInsets.all(16), children: [
        Text('Próximos eventos', style: Theme.of(context).textTheme.titleLarge),
        const SizedBox(height: 10),
        ..._events.where((e) => !e.past).map((event) => Card(
            child: ListTile(
                leading: const CircleAvatar(child: Icon(Icons.event)),
                title: Text(event.name),
                subtitle: Text(
                    '${event.date}\n${event.place}\nDesde \$${event.price}'),
                isThreeLine: true,
                trailing: const Icon(Icons.chevron_right),
                onTap: () => onOpen(event)))),
        const SizedBox(height: 16),
        Text('Eventos pasados', style: Theme.of(context).textTheme.titleLarge),
        ..._events.where((e) => e.past).map((event) => Card(
            child: ListTile(
                title: Text(event.name),
                subtitle: Text(event.date),
                trailing: const Icon(Icons.history),
                onTap: () => onOpen(event)))),
      ]);
}

class TicketsPage extends StatefulWidget {
  const TicketsPage({super.key, required this.event});
  final Event event;
  @override
  State<TicketsPage> createState() => _TicketsPageState();
}

class _TicketsPageState extends State<TicketsPage> {
  bool _sent = false;
  String? get _code => switch (widget.event.id) {
        'evt-1' => 'HXC-QR-000123',
        'evt-2' => 'HXC-QR-000124',
        'evt-4' => 'HXC-QR-000099',
        _ => null,
      };
  void _send() {
    final email = TextEditingController();
    showDialog(
        context: context,
        builder: (context) => AlertDialog(
                title: const Text('Enviar entrada'),
                content: TextField(
                    controller: email,
                    keyboardType: TextInputType.emailAddress,
                    decoration: const InputDecoration(
                        labelText: 'Correo del destinatario')),
                actions: [
                  TextButton(
                      onPressed: () => Navigator.pop(context),
                      child: const Text('Cancelar')),
                  FilledButton(
                      onPressed: () {
                        if (!email.text.contains('@')) return;
                        Navigator.pop(context);
                        setState(() => _sent = true);
                      },
                      child: const Text('Enviar'))
                ]));
  }

  @override
  Widget build(BuildContext context) => Scaffold(
      appBar: AppBar(title: const Text('Mis entradas')),
      body: ListView(padding: const EdgeInsets.all(16), children: [
        Text(widget.event.name,
            style: Theme.of(context).textTheme.headlineSmall),
        Text('${widget.event.date} · ${widget.event.place}'),
        const SizedBox(height: 20),
        if (_code == null)
          const Card(
              child: Padding(
                  padding: EdgeInsets.all(20),
                  child: Text('No tienes entradas para este evento.')))
        else
          Card(
              child: Padding(
                  padding: const EdgeInsets.all(20),
                  child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        const Icon(Icons.qr_code_2, size: 150),
                        const SizedBox(height: 8),
                        Text(_code!, textAlign: TextAlign.center),
                        const Divider(),
                        const Text('Platea Baja · Fila 12 · Silla 34'),
                        const Text('Ticket: TCK-2026-000123'),
                        const Text('Transacción: TXN-2026-000501'),
                        const SizedBox(height: 12),
                        FilledButton.icon(
                            onPressed: _send,
                            icon: const Icon(Icons.send_outlined),
                            label: Text(
                                _sent ? 'Entrada enviada' : 'Enviar entrada')),
                      ]))),
      ]));
}

class ParkingPage extends StatefulWidget {
  const ParkingPage({super.key});
  @override
  State<ParkingPage> createState() => _ParkingPageState();
}

class _ParkingPageState extends State<ParkingPage> {
  bool _validated = false;
  bool _directions = false;
  @override
  Widget build(BuildContext context) =>
      ListView(padding: const EdgeInsets.all(16), children: [
        Text('Tu reserva', style: Theme.of(context).textTheme.titleLarge),
        const SizedBox(height: 10),
        Card(
            child: Padding(
                padding: const EdgeInsets.all(20),
                child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const ListTile(
                          contentPadding: EdgeInsets.zero,
                          leading: Icon(Icons.local_parking, size: 38),
                          title: Text('HEXACORE Fest 2026'),
                          subtitle: Text('Movistar Arena, Bogotá')),
                      const Divider(),
                      const Text('Zona B · Espacio B-04'),
                      const SizedBox(height: 16),
                      const Center(child: Icon(Icons.qr_code_2, size: 140)),
                      const Center(child: Text('HXC-PARK-000045')),
                      const SizedBox(height: 16),
                      OutlinedButton.icon(
                          onPressed: () => setState(() => _directions = true),
                          icon: const Icon(Icons.directions),
                          label: const Text('Cómo llegar')),
                      if (_directions)
                        const Padding(
                            padding: EdgeInsets.only(top: 8),
                            child: Text(
                                'Abriendo ruta a Movistar Arena, Bogotá.')),
                      const SizedBox(height: 8),
                      if (!_validated)
                        FilledButton(
                            onPressed: () => setState(() => _validated = true),
                            child: const Text('Simular validación de ingreso'))
                      else
                        const ListTile(
                            contentPadding: EdgeInsets.zero,
                            leading: Icon(Icons.timer_outlined),
                            title: Text('Ingreso validado'),
                            subtitle: Text('Llevas aquí: 0 h 0 min')),
                    ]))),
      ]);
}

class Order {
  Order(this.store, this.items, this.total, this.status);
  final String store, status;
  final List<String> items;
  final int total;
}

class OrdersPage extends StatefulWidget {
  const OrdersPage({super.key, required this.orders, required this.onNewOrder});
  final List<Order> orders;
  final VoidCallback onNewOrder;
  @override
  State<OrdersPage> createState() => _OrdersPageState();
}

class _OrdersPageState extends State<OrdersPage> {
  bool _mine = false;
  @override
  Widget build(BuildContext context) =>
      ListView(padding: const EdgeInsets.all(16), children: [
        SegmentedButton<bool>(segments: const [
          ButtonSegment(
              value: false,
              label: Text('Restaurantes'),
              icon: Icon(Icons.storefront_outlined)),
          ButtonSegment(
              value: true,
              label: Text('Mis pedidos'),
              icon: Icon(Icons.receipt_long))
        ], selected: {
          _mine
        }, onSelectionChanged: (value) => setState(() => _mine = value.first)),
        const SizedBox(height: 12),
        if (!_mine) ...[
          FilledButton.icon(
              onPressed: widget.onNewOrder,
              icon: const Icon(Icons.add),
              label: const Text('Ver restaurantes')),
          const SizedBox(height: 12),
          const _SectionCard(
              title: 'Food Truck La Sazón',
              lines: ['Comida rápida'],
              icon: Icons.fastfood),
          const _SectionCard(
              title: 'Cafetería Central',
              lines: ['Café y repostería'],
              icon: Icons.coffee),
          const _SectionCard(
              title: 'Cervecería del Parche',
              lines: ['Cerveza artesanal y piqueos'],
              icon: Icons.sports_bar)
        ] else
          ...widget.orders.map((order) => Card(
              child: ListTile(
                  leading: const Icon(Icons.receipt_long),
                  title: Text(order.store),
                  subtitle: Text('${order.items.join(' · ')}\n${order.status}'),
                  isThreeLine: true,
                  trailing: Text('\$${order.total}')))),
      ]);
}

class RestaurantsPage extends StatefulWidget {
  const RestaurantsPage({super.key, required this.onPaid});
  final ValueChanged<Order> onPaid;
  @override
  State<RestaurantsPage> createState() => _RestaurantsPageState();
}

class _RestaurantsPageState extends State<RestaurantsPage> {
  final Map<Product, int> _cart = {};
  final _stores = <String, List<Product>>{
    'Food Truck La Sazón': const [
      Product('Hamburguesa', 25000),
      Product('Perro caliente', 18000),
      Product('Papas fritas', 12000),
      Product('Gaseosa', 6000)
    ],
    'Cafetería Central': const [
      Product('Café', 8000),
      Product('Croissant', 9000),
      Product('Jugo natural', 7000, available: false)
    ],
    'Cervecería del Parche': const [
      Product('Cerveza artesanal', 16000),
      Product('Nachos', 20000)
    ],
  };
  int get _total => _cart.entries
      .fold(0, (sum, entry) => sum + entry.key.price * entry.value);
  @override
  Widget build(BuildContext context) => Scaffold(
      appBar: AppBar(title: const Text('Restaurantes')),
      body: ListView(
          padding: const EdgeInsets.all(16),
          children: _stores.entries
              .expand((store) => [
                    Padding(
                        padding: const EdgeInsets.only(top: 10, bottom: 4),
                        child: Text(store.key,
                            style: Theme.of(context).textTheme.titleLarge)),
                    ...store.value.map((product) => Card(
                        child: ListTile(
                            enabled: product.available,
                            title: Text(product.name),
                            subtitle: Text(
                                '\$${product.price}${product.available ? '' : ' · No disponible'}'),
                            trailing: product.available
                                ? Row(
                                    mainAxisSize: MainAxisSize.min,
                                    children: [
                                        if (_cart.containsKey(product))
                                          IconButton(
                                              icon: const Icon(
                                                  Icons.remove_circle_outline),
                                              onPressed: () => setState(() {
                                                    final count =
                                                        _cart[product]!;
                                                    if (count == 1) {
                                                      _cart.remove(product);
                                                    } else {
                                                      _cart[product] =
                                                          count - 1;
                                                    }
                                                  })),
                                        if (_cart.containsKey(product))
                                          Text('${_cart[product]}'),
                                        IconButton(
                                            icon: const Icon(
                                                Icons.add_circle_outline),
                                            onPressed: () => setState(() =>
                                                _cart[product] =
                                                    (_cart[product] ?? 0) + 1))
                                      ])
                                : null))),
                  ])
              .toList()),
      bottomNavigationBar: _cart.isEmpty
          ? null
          : SafeArea(
              child: Padding(
                  padding: const EdgeInsets.all(12),
                  child: FilledButton(
                      onPressed: _checkout,
                      child: Text('Continuar al pago · \$$_total')))));
  void _checkout() {
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
                      const Text('Resumen del pago',
                          style: TextStyle(
                              fontSize: 20, fontWeight: FontWeight.w600)),
                      const SizedBox(height: 12),
                      ..._cart.entries.map((e) => Text(
                          '${e.value}x ${e.key.name} · \$${e.value * e.key.price}')),
                      const Divider(),
                      Text('Total: \$$_total',
                          style: const TextStyle(
                              fontSize: 18, fontWeight: FontWeight.bold)),
                      DropdownButtonFormField<String>(
                          initialValue: method,
                          decoration: const InputDecoration(
                              labelText: 'Método de pago'),
                          items: const [
                            DropdownMenuItem(
                                value: 'Tarjeta de crédito o débito',
                                child: Text('Tarjeta de crédito o débito')),
                            DropdownMenuItem(value: 'PSE', child: Text('PSE'))
                          ],
                          onChanged: (value) =>
                              setSheetState(() => method = value!)),
                      FilledButton(
                          onPressed: () {
                            Navigator.pop(context);
                            _confirmPayment();
                          },
                          child: const Text('Confirmar pago'))
                    ]))));
  }

  void _confirmPayment() {
    final store =
        _stores.entries.firstWhere((s) => s.value.any(_cart.containsKey)).key;
    widget.onPaid(Order(
        store,
        _cart.entries.map((e) => '${e.value}x ${e.key.name}').toList(),
        _total,
        'En preparación'));
    Navigator.of(context).pop();
  }
}

class StaffShell extends StatefulWidget {
  const StaffShell(
      {super.key,
      required this.user,
      required this.dark,
      required this.onDarkChanged,
      required this.onLogout});
  final User user;
  final bool dark;
  final ValueChanged<bool> onDarkChanged;
  final VoidCallback onLogout;
  @override
  State<StaffShell> createState() => _StaffShellState();
}

class _StaffShellState extends State<StaffShell> {
  int _tab = 0;
  @override
  Widget build(BuildContext context) {
    final pages = _staffPages(widget.user.position);
    final current = pages[_tab];
    return Scaffold(
        appBar: AppBar(title: Text(current.title)),
        drawer: AppDrawer(
            user: widget.user,
            dark: widget.dark,
            onDarkChanged: widget.onDarkChanged,
            onLogout: widget.onLogout),
        body: current.page,
        bottomNavigationBar: NavigationBar(
            selectedIndex: _tab,
            onDestinationSelected: (i) => setState(() => _tab = i),
            destinations: pages
                .map((page) => NavigationDestination(
                    icon: Icon(page.icon), label: page.title))
                .toList()));
  }
}

class StaffDestination {
  const StaffDestination(this.title, this.icon, this.page);
  final String title;
  final IconData icon;
  final Widget page;
}

List<StaffDestination> _staffPages(String? position) {
  if (position == 'Jefe de personal') {
    return [
      const StaffDestination(
          'Validar personal', Icons.badge_outlined, PersonnelValidationPage())
    ];
  }
  final operational = switch (position) {
    'Entrada' => const StaffDestination('Validar entradas',
        Icons.confirmation_number_outlined, EntryValidationPage()),
    'Parqueadero' => const StaffDestination(
        'Parqueadero', Icons.local_parking_outlined, ParkingOperationsPage()),
    _ => const StaffDestination(
        'Pedidos', Icons.restaurant_outlined, RestaurantOrdersPage()),
  };
  return [
    const StaffDestination('Turnos', Icons.schedule_outlined, ShiftsPage()),
    const StaffDestination(
        'Asistencia', Icons.how_to_reg_outlined, AttendancePage()),
    operational,
    const StaffDestination(
        'Incidentes', Icons.report_outlined, IncidentsPage()),
    StaffDestination('Emergencia', Icons.warning_amber_outlined,
        EmergencyPage(position: position)),
  ];
}

class ShiftsPage extends StatelessWidget {
  const ShiftsPage({super.key});
  @override
  Widget build(BuildContext context) =>
      ListView(padding: const EdgeInsets.all(16), children: const [
        _SectionCard(
            title: 'HEXACORE Fest 2026',
            lines: ['Puerta Norte', '12 dic 2026 · 3:00 p. m. – 11:00 p. m.'],
            icon: Icons.event_available),
        _SectionCard(
            title: 'Noche de Rock Nacional',
            lines: [
              'Zona de Parqueadero',
              '20 sep 2026 · 5:00 p. m. – 10:00 p. m.'
            ],
            icon: Icons.event_available),
      ]);
}

class AttendancePage extends StatefulWidget {
  const AttendancePage({super.key});
  @override
  State<AttendancePage> createState() => _AttendancePageState();
}

class _AttendancePageState extends State<AttendancePage> {
  String? _entry;
  String? _exit;
  String get _time {
    final now = TimeOfDay.now();
    return now.format(context);
  }

  @override
  Widget build(BuildContext context) =>
      ListView(padding: const EdgeInsets.all(16), children: [
        const _SectionCard(
            title: 'HEXACORE Fest 2026',
            lines: ['Puerta Norte', '12 dic 2026 · 3:00 p. m. – 11:00 p. m.'],
            icon: Icons.schedule),
        Card(
            child: Padding(
                padding: const EdgeInsets.all(18),
                child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Text(_entry == null
                          ? 'Aún no has registrado asistencia.'
                          : _exit == null
                              ? 'En turno desde $_entry.'
                              : 'Turno finalizado. Entrada: $_entry · Salida: $_exit.'),
                      const SizedBox(height: 12),
                      if (_entry == null)
                        FilledButton(
                            onPressed: () => setState(() => _entry = _time),
                            child: const Text('Registrar entrada'))
                      else if (_exit == null)
                        FilledButton(
                            onPressed: () => setState(() => _exit = _time),
                            child: const Text('Registrar salida')),
                    ]))),
      ]);
}

class EntryValidationPage extends StatefulWidget {
  const EntryValidationPage({super.key});
  @override
  State<EntryValidationPage> createState() => _EntryValidationPageState();
}

class _EntryValidationPageState extends State<EntryValidationPage> {
  int? _selected;
  final _entries = [
    'HXC-QR-000123 · Platea Baja',
    'HXC-QR-000201 · General',
    'HXC-QR-000202 · Palco VIP'
  ];
  final _valid = <int>{};
  @override
  Widget build(BuildContext context) =>
      ListView(padding: const EdgeInsets.all(16), children: [
        FilledButton.icon(
            onPressed: () =>
                setState(() => _selected = _entries.indexWhere((_) => true)),
            icon: const Icon(Icons.qr_code_scanner),
            label: const Text('Escanear entrada')),
        const SizedBox(height: 14),
        if (_selected == null)
          const Text('Escanea el QR de una boleta para revisar su validez.')
        else
          Card(
              child: Padding(
                  padding: const EdgeInsets.all(18),
                  child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        const Text('HEXACORE Fest 2026',
                            style: TextStyle(
                                fontSize: 20, fontWeight: FontWeight.w600)),
                        Text(_entries[_selected!]),
                        const SizedBox(height: 12),
                        Chip(
                            label: Text(_valid.contains(_selected)
                                ? 'Entrada validada'
                                : 'Entrada válida')),
                        if (!_valid.contains(_selected))
                          FilledButton(
                              onPressed: () =>
                                  setState(() => _valid.add(_selected!)),
                              child: const Text('Validar ingreso')),
                        OutlinedButton(
                            onPressed: () => setState(() => _selected = null),
                            child: const Text('Escanear otra')),
                      ]))),
      ]);
}

class ParkingOperationsPage extends StatefulWidget {
  const ParkingOperationsPage({super.key});
  @override
  State<ParkingOperationsPage> createState() => _ParkingOperationsPageState();
}

class _ParkingOperationsPageState extends State<ParkingOperationsPage> {
  final _waiting = <_Vehicle>[
    const _Vehicle('ABC123', 'HXC-PARK-000301', false),
    const _Vehicle('XYZ987', 'HXC-PARK-000302', true)
  ];
  final _inside = <_Vehicle>[
    const _Vehicle('JKL456', 'HXC-PARK-000150', false, space: 'A-07')
  ];
  final _spaces = <String>['A-08', 'A-09', 'B-05'];
  final _departed = <String>{};
  @override
  Widget build(BuildContext context) =>
      ListView(padding: const EdgeInsets.all(16), children: [
        Text('Por ingresar', style: Theme.of(context).textTheme.titleMedium),
        const SizedBox(height: 8),
        ..._waiting.map((v) => Card(
            child: ListTile(
                title: Text(v.plate),
                subtitle: Text(
                    '${v.code} · ${v.prepaid ? 'Prepago' : 'Pago pendiente'}'),
                trailing: FilledButton(
                    onPressed: _spaces.isEmpty
                        ? null
                        : () => setState(() {
                              final space = _spaces.removeAt(0);
                              _waiting.remove(v);
                              _inside.add(_Vehicle(v.plate, v.code, v.prepaid,
                                  space: space));
                            }),
                    child: Text(_spaces.isEmpty
                        ? 'Sin cupos'
                        : 'Asignar ${_spaces.first}'))))),
        const Divider(height: 32),
        Text('En el lote', style: Theme.of(context).textTheme.titleMedium),
        const SizedBox(height: 8),
        ..._inside.map((v) => Card(
            child: ListTile(
                title: Text('${v.plate} · ${v.space}'),
                subtitle: Text(_departed.contains(v.code)
                    ? (v.prepaid
                        ? 'Salida registrada · Prepago'
                        : 'Salida registrada · Cobro: \$15.000')
                    : 'Ingreso registrado'),
                trailing: _departed.contains(v.code)
                    ? null
                    : FilledButton(
                        onPressed: () => setState(() => _departed.add(v.code)),
                        child: const Text('Registrar salida'))))),
      ]);
}

class _Vehicle {
  const _Vehicle(this.plate, this.code, this.prepaid, {this.space});
  final String plate, code;
  final bool prepaid;
  final String? space;
}

class RestaurantOrdersPage extends StatefulWidget {
  const RestaurantOrdersPage({super.key});
  @override
  State<RestaurantOrdersPage> createState() => _RestaurantOrdersPageState();
}

class _RestaurantOrdersPageState extends State<RestaurantOrdersPage> {
  int? _selected;
  final _delivered = <int>{};
  final _orders = [
    'HXC-PED-000050 · 1x Perro caliente · Pendiente de pago',
    'HXC-PED-000045 · 2x Hamburguesa, 1x Gaseosa · Prepago'
  ];
  @override
  Widget build(BuildContext context) =>
      ListView(padding: const EdgeInsets.all(16), children: [
        FilledButton.icon(
            onPressed: () => setState(() => _selected = 0),
            icon: const Icon(Icons.qr_code_scanner),
            label: const Text('Escanear pedido')),
        const SizedBox(height: 12),
        if (_selected == null)
          const Text('Escanea el QR del cliente antes de cobrar o entregar.')
        else
          Card(
              child: Padding(
                  padding: const EdgeInsets.all(18),
                  child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        const Text('Food Truck La Sazón',
                            style: TextStyle(
                                fontSize: 20, fontWeight: FontWeight.w600)),
                        Text(_orders[_selected!]),
                        const SizedBox(height: 12),
                        Chip(
                            label: Text(_delivered.contains(_selected)
                                ? 'Pedido entregado'
                                : _selected == 0
                                    ? 'Pago pendiente'
                                    : 'Prepago')),
                        if (!_delivered.contains(_selected))
                          FilledButton(
                              onPressed: () =>
                                  setState(() => _delivered.add(_selected!)),
                              child: Text(_selected == 0
                                  ? 'Cobrar y entregar'
                                  : 'Validar entrega')),
                        OutlinedButton(
                            onPressed: () => setState(() => _selected = null),
                            child: const Text('Escanear otro')),
                      ]))),
      ]);
}

class PersonnelValidationPage extends StatefulWidget {
  const PersonnelValidationPage({super.key});
  @override
  State<PersonnelValidationPage> createState() =>
      _PersonnelValidationPageState();
}

class _PersonnelValidationPageState extends State<PersonnelValidationPage> {
  int? _selected;
  int _state = 0;
  final _people = [
    'Luis Ramírez · Entrada',
    'Marta Gómez · Parqueadero',
    'Carlos Peña · Restaurante'
  ];
  @override
  Widget build(BuildContext context) =>
      ListView(padding: const EdgeInsets.all(16), children: [
        FilledButton.icon(
            onPressed: () => setState(() => _selected = 0),
            icon: const Icon(Icons.qr_code_scanner),
            label: const Text('Escanear personal')),
        const SizedBox(height: 12),
        if (_selected == null)
          const Text('Escanea el QR del empleado para registrar su turno.')
        else
          Card(
              child: Padding(
                  padding: const EdgeInsets.all(18),
                  child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        Text(_people[_selected!],
                            style: const TextStyle(
                                fontSize: 20, fontWeight: FontWeight.w600)),
                        const Text('HXC-STAFF-000010'),
                        const SizedBox(height: 12),
                        Chip(
                            label: Text(_state == 0
                                ? 'Pendiente de ingreso'
                                : _state == 1
                                    ? 'Ingreso registrado'
                                    : 'Turno completo')),
                        if (_state == 0)
                          FilledButton(
                              onPressed: () => setState(() => _state = 1),
                              child: const Text('Registrar ingreso'))
                        else if (_state == 1)
                          FilledButton(
                              onPressed: () => setState(() => _state = 2),
                              child: const Text('Registrar salida')),
                        OutlinedButton(
                            onPressed: () => setState(() {
                                  _selected = null;
                                  _state = 0;
                                }),
                            child: const Text('Escanear otro')),
                      ]))),
      ]);
}

class IncidentsPage extends StatefulWidget {
  const IncidentsPage({super.key});
  @override
  State<IncidentsPage> createState() => _IncidentsPageState();
}

class _IncidentsPageState extends State<IncidentsPage> {
  final _items = <String>[
    'Fila desbordada en Puerta Norte\nSe reforzó con un carril adicional de validación. · 6:40 p. m.'
  ];
  final _title = TextEditingController();
  final _description = TextEditingController();
  @override
  void dispose() {
    _title.dispose();
    _description.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) =>
      ListView(padding: const EdgeInsets.all(16), children: [
        Text('Reportar incidente',
            style: Theme.of(context).textTheme.titleMedium),
        const SizedBox(height: 8),
        TextField(
            controller: _title,
            decoration: const InputDecoration(
                border: OutlineInputBorder(), labelText: 'Título')),
        const SizedBox(height: 10),
        TextField(
            controller: _description,
            maxLines: 3,
            decoration: const InputDecoration(
                border: OutlineInputBorder(), labelText: 'Descripción')),
        const SizedBox(height: 10),
        FilledButton(
            onPressed: () {
              if (_title.text.trim().isEmpty) return;
              setState(() {
                _items.insert(0,
                    '${_title.text}\n${_description.text} · ${TimeOfDay.now().format(context)}');
                _title.clear();
                _description.clear();
              });
            },
            child: const Text('Reportar incidente')),
        const Divider(height: 32),
        Text('Incidentes reportados',
            style: Theme.of(context).textTheme.titleMedium),
        ..._items.map((item) => Card(
            child:
                Padding(padding: const EdgeInsets.all(16), child: Text(item)))),
      ]);
}

class EmergencyPage extends StatefulWidget {
  const EmergencyPage({super.key, required this.position});
  final String? position;
  @override
  State<EmergencyPage> createState() => _EmergencyPageState();
}

class _EmergencyPageState extends State<EmergencyPage> {
  @override
  Widget build(BuildContext context) {
    final info = switch (widget.position) {
      'Parqueadero' => (
          'Vía de Servicio hacia la calle principal',
          'Junto a la barrera de salida vehicular',
          'Abre las barreras y prioriza la salida peatonal.'
        ),
      'Restaurante' => (
          'Salida Este',
          'Frente al punto de comida',
          'Apaga los equipos de gas y despeja el área.'
        ),
      _ => (
          'Salida Norte',
          'Bajo el arco de Puerta Norte',
          'Detén el ingreso y guía la salida en calma.'
        )
    };
    return ListView(padding: const EdgeInsets.all(16), children: [
      Card(
          color: Theme.of(context).colorScheme.errorContainer,
          child: Padding(
              padding: const EdgeInsets.all(20),
              child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Icon(Icons.warning_amber_rounded, size: 44),
                    const SizedBox(height: 12),
                    const Text('Protocolo de emergencia',
                        style: TextStyle(
                            fontSize: 21, fontWeight: FontWeight.w600)),
                    const SizedBox(height: 10),
                    Text('Ruta: ${info.$1}\nPuesto: ${info.$2}\n\n${info.$3}')
                  ]))),
      FilledButton(
          onPressed: () => showDialog(
              context: context,
              builder: (_) => AlertDialog(
                      title: const Text('Emergencia activada'),
                      content: Text('Ruta: ${info.$1}\n\n${info.$3}'),
                      actions: [
                        TextButton(
                            onPressed: () => Navigator.pop(context),
                            child: const Text('Entendido'))
                      ])),
          child: const Text('Activar protocolo de emergencia'))
    ]);
  }
}

class _SectionCard extends StatelessWidget {
  const _SectionCard(
      {required this.title, required this.lines, required this.icon});
  final String title;
  final List<String> lines;
  final IconData icon;
  @override
  Widget build(BuildContext context) => Card(
      child: ListTile(
          leading: Icon(icon, size: 34),
          title: Text(title),
          subtitle: Text(lines.join('\n')),
          isThreeLine: true));
}

class ProfilePage extends StatefulWidget {
  const ProfilePage({super.key, required this.user});
  final User user;
  @override
  State<ProfilePage> createState() => _ProfilePageState();
}

class _ProfilePageState extends State<ProfilePage> {
  late final TextEditingController _email =
      TextEditingController(text: widget.user.email);
  late final TextEditingController _phone =
      TextEditingController(text: '300 123 4567');
  bool _saved = false;
  @override
  void dispose() {
    _email.dispose();
    _phone.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Scaffold(
      appBar: AppBar(title: const Text('Perfil')),
      body: ListView(padding: const EdgeInsets.all(24), children: [
        Center(
            child: CircleAvatar(
                radius: 42,
                child: Text(widget.user.name.substring(0, 1),
                    style: const TextStyle(fontSize: 32)))),
        const SizedBox(height: 12),
        OutlinedButton.icon(
            onPressed: () => ScaffoldMessenger.of(context).showSnackBar(
                const SnackBar(
                    content: Text(
                        'El selector de foto se conectará al servicio de archivos.'))),
            icon: const Icon(Icons.photo_camera_outlined),
            label: const Text('Cambiar foto')),
        const SizedBox(height: 12),
        ListTile(
            leading: const Icon(Icons.person_outline),
            title: const Text('Nombre'),
            subtitle: Text(widget.user.name)),
        TextField(
            controller: _email,
            keyboardType: TextInputType.emailAddress,
            decoration: const InputDecoration(
                labelText: 'Correo', border: OutlineInputBorder())),
        const SizedBox(height: 12),
        TextField(
            controller: _phone,
            keyboardType: TextInputType.phone,
            decoration: const InputDecoration(
                labelText: 'Teléfono', border: OutlineInputBorder())),
        const SizedBox(height: 12),
        ListTile(
            leading: const Icon(Icons.badge_outlined),
            title: const Text('Rol'),
            subtitle: Text(widget.user.position ?? widget.user.role)),
        FilledButton(
            onPressed: () => setState(() => _saved = true),
            child: const Text('Guardar cambios')),
        if (_saved)
          const Padding(
              padding: EdgeInsets.only(top: 10),
              child: Text('Perfil guardado.')),
      ]));
}

class SettingsPage extends StatefulWidget {
  const SettingsPage(
      {super.key,
      required this.dark,
      required this.onDarkChanged,
      required this.onLogout});
  final bool dark;
  final ValueChanged<bool> onDarkChanged;
  final VoidCallback onLogout;
  @override
  State<SettingsPage> createState() => _SettingsPageState();
}

class _SettingsPageState extends State<SettingsPage> {
  bool _notifications = true;
  @override
  Widget build(BuildContext context) => Scaffold(
      appBar: AppBar(title: const Text('Ajustes')),
      body: ListView(padding: const EdgeInsets.all(16), children: [
        Text('Preferencias', style: Theme.of(context).textTheme.titleSmall),
        SwitchListTile(
            title: const Text('Notificaciones'),
            value: _notifications,
            onChanged: (value) => setState(() => _notifications = value)),
        SwitchListTile(
            title: const Text('Modo oscuro'),
            value: widget.dark,
            onChanged: widget.onDarkChanged),
        const Divider(height: 32),
        Text('Soporte', style: Theme.of(context).textTheme.titleSmall),
        const ListTile(
            leading: Icon(Icons.help_outline),
            title: Text('Ayuda'),
            subtitle: Text(
                'Comunícate con soporte de HEXACORE para resolver tus dudas.')),
        const Divider(height: 32),
        Text('Acerca de', style: Theme.of(context).textTheme.titleSmall),
        const ListTile(
            title: Text('HEXACORE'),
            subtitle: Text('Versión 0.1.0 · Equipo HEXACORE')),
        OutlinedButton.icon(
            onPressed: widget.onLogout,
            icon: const Icon(Icons.logout),
            label: const Text('Cerrar sesión')),
      ]));
}
