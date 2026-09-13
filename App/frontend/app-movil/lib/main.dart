import 'dart:math';

import 'package:flutter/material.dart';
import 'package:flutter_native_splash/flutter_native_splash.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'pages/forgot_password_page.dart';
import 'pages/notifications_page.dart';
import 'pages/onboarding_page.dart';
import 'pages/register_page.dart';
import 'pages/activity_page.dart';
import 'pages/resale_page.dart';
import 'pages/change_password_page.dart';
import 'theme/app_theme.dart';
import 'widgets/liquid_glass.dart';
import 'widgets/qr_scanner_sheet.dart';
import 'models/activity_log.dart';
import 'models/requests_store.dart';
import 'services/api_client.dart';

void main() {
  final widgetsBinding = WidgetsFlutterBinding.ensureInitialized();
  FlutterNativeSplash.preserve(widgetsBinding: widgetsBinding);
  runApp(const HexacoreApp());
}

const _kInk = Color(0xFF0B0F1A);
const _kPaper = Color(0xFFF5F3EF);
const _kPink = Color(0xFFFF3D7F);
const _kCyan = Color(0xFF22D3EE);
const _kIndigo = Color(0xFF3B5BFF);
const _kAmber = Color(0xFFFFB020);
const _kGreen = Color(0xFF34D399);
const _kRed = Color(0xFFFF5A5F);

const _rowAccents = [_kPink, _kCyan, _kAmber, _kIndigo];
const _dateFilters = ['Todos', 'Este mes', 'Próximos 3 meses'];

// simula que una de cada ~7 acciones de validación falla por conexión, para
// que las pantallas de escaneo de Personal no se sientan 100% infalibles
final _random = Random();
bool _networkGlitch() => _random.nextInt(7) == 0;
const _kConnectionError =
    'No se pudo conectar con el servidor, intenta de nuevo.';

class User {
  const User(this.name, this.email, this.role, {this.position});
  final String name;
  final String email;
  final String role;
  final String? position;
}

class Event {
  const Event(this.id, this.name, this.date, this.place, this.price,
      {required this.day, this.past = false, this.category = 'Otro'});
  final String id, name, date, place;
  final int price;
  final bool past;
  final String category;
  // fecha real del evento, aparte del string ya usado para mostrarlo, para
  // poder filtrar por rango sin tener que parsear "12 dic 2026"
  final DateTime day;
}

class Product {
  const Product(this.name, this.price, {this.available = true});
  final String name;
  final int price;
  final bool available;
}

final _events = [
  Event('evt-1', 'HEXACORE Fest 2026', '12 dic 2026', 'Movistar Arena, Bogotá',
      180000,
      day: DateTime(2026, 12, 12), category: 'Concierto'),
  Event('evt-2', 'Noche de Rock Nacional', '20 sep 2026',
      'Coliseo El Campín, Bogotá', 95000,
      day: DateTime(2026, 9, 20), category: 'Concierto'),
  Event('evt-3', 'Feria Gastronómica', '5 oct 2026', 'Corferias, Bogotá', 40000,
      day: DateTime(2026, 10, 5), category: 'Gastronomía'),
  Event('evt-5', 'Comedia en Vivo', '28 sep 2026', 'Teatro Colsubsidio, Bogotá',
      35000,
      day: DateTime(2026, 9, 28), category: 'Comedia'),
  Event('evt-6', 'Maratón HEXACORE 10K', '10 nov 2026',
      'Parque El Virrey, Bogotá', 20000,
      day: DateTime(2026, 11, 10), category: 'Deportivo'),
  Event('evt-4', 'Festival de Verano 2026', '15 jun 2026',
      'Parque Simón Bolívar, Bogotá', 65000,
      day: DateTime(2026, 6, 15), past: true, category: 'Cultural'),
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

const _sessionEmailKey = 'session_email';
const _onboardingSeenKey = 'onboarding_seen';

class _HexacoreAppState extends State<HexacoreApp> {
  User? _user;
  bool _dark = true;
  bool _checkingSession = true;
  bool _showOnboarding = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance
        .addPostFrameCallback((_) => FlutterNativeSplash.remove());
    _restoreSession();
  }

  Future<void> _restoreSession() async {
    final prefs = await SharedPreferences.getInstance();
    final email = prefs.getString(_sessionEmailKey);
    final restored = email == null ? null : _accounts[email];
    final onboardingSeen = prefs.getBool(_onboardingSeenKey) ?? false;
    if (!mounted) return;
    setState(() {
      _user = restored;
      _checkingSession = false;
      _showOnboarding = restored == null && !onboardingSeen;
    });
  }

  Future<void> _finishOnboarding() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool(_onboardingSeenKey, true);
    setState(() => _showOnboarding = false);
  }

  // Solo las 5 cuentas demo fijas en `_accounts` persisten entre reinicios:
  // son las únicas que se pueden "restaurar" con datos consistentes. Las
  // cuentas creadas por registro o login social (Google/Apple simulado) no
  // existen en `_accounts`, así que actúan como sesión de invitado: viven
  // mientras la app está abierta, pero no sobreviven a cerrarla.
  Future<void> _handleLogin(User user) async {
    setState(() => _user = user);
    if (_accounts.containsKey(user.email)) {
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(_sessionEmailKey, user.email);
    }
  }

  Future<void> _handleLogout() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_sessionEmailKey);
    setState(() => _user = null);
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'HEXACORE',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light(),
      darkTheme: AppTheme.dark(),
      themeMode: _dark ? ThemeMode.dark : ThemeMode.light,
      home: _checkingSession
          ? const GlassScaffold(
              body: Center(child: CircularProgressIndicator()),
            )
          : _showOnboarding
              ? OnboardingPage(onDone: _finishOnboarding)
              : _user == null
                  ? LoginPage(onLogin: _handleLogin)
                  : _user!.role == 'Cliente'
                      ? ClientShell(
                          user: _user!,
                          dark: _dark,
                          onDarkChanged: (value) =>
                              setState(() => _dark = value),
                          onLogout: _handleLogout)
                      : StaffShell(
                          user: _user!,
                          dark: _dark,
                          onDarkChanged: (value) =>
                              setState(() => _dark = value),
                          onLogout: _handleLogout),
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

  Future<void> _submit() async {
    await apiClient.login(_email.text.trim(), _password.text);
    if (!mounted) return;
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
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return GlassScaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            child: Padding(
              padding: const EdgeInsets.all(28),
              child: LiquidGlassCard(
                padding: const EdgeInsets.all(28),
                borderRadius: BorderRadius.circular(32),
                child: Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      Icon(Icons.hexagon_rounded,
                          color: scheme.primary, size: 56),
                      const SizedBox(height: 16),
                      Text('HEXACORE',
                          textAlign: TextAlign.center,
                          style: Theme.of(context).textTheme.headlineMedium),
                      const SizedBox(height: 4),
                      Text('Bienvenida de nuevo',
                          textAlign: TextAlign.center,
                          style: Theme.of(context)
                              .textTheme
                              .bodyMedium
                              ?.copyWith(
                                  color:
                                      scheme.onSurface.withValues(alpha: 0.6))),
                      const SizedBox(height: 28),
                      TextField(
                          controller: _email,
                          keyboardType: TextInputType.emailAddress,
                          decoration:
                              const InputDecoration(labelText: 'Correo')),
                      const SizedBox(height: 14),
                      TextField(
                          controller: _password,
                          obscureText: true,
                          onSubmitted: (_) => _submit(),
                          decoration:
                              const InputDecoration(labelText: 'Contraseña')),
                      Align(
                        alignment: Alignment.centerRight,
                        child: TextButton(
                          onPressed: () => Navigator.of(context).push(
                              MaterialPageRoute(
                                  builder: (_) => const ForgotPasswordPage())),
                          child: const Text('¿Olvidaste tu contraseña?'),
                        ),
                      ),
                      if (_error != null)
                        Padding(
                            padding: const EdgeInsets.only(top: 10),
                            child: Text(_error!,
                                style: const TextStyle(color: _kRed))),
                      const SizedBox(height: 20),
                      LoadingFilledButton(
                          label: 'Ingresar', onPressed: _submit),
                      const SizedBox(height: 12),
                      Text('Datos de demostración · contraseña: 1234',
                          textAlign: TextAlign.center,
                          style: Theme.of(context)
                              .textTheme
                              .bodySmall
                              ?.copyWith(
                                  color:
                                      scheme.onSurface.withValues(alpha: 0.5))),
                      const SizedBox(height: 8),
                      Center(
                        child: TextButton(
                          onPressed: () => Navigator.of(context).push(
                              MaterialPageRoute(
                                  builder: (_) => RegisterPage(
                                      onRegistered: widget.onLogin))),
                          child: const Text('¿No tienes cuenta? Regístrate'),
                        ),
                      ),
                    ]),
              ),
            ),
          ),
        ),
      ),
    );
  }
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
  int _unread = 3;
  final List<Order> _orders = [
    Order('Food Truck La Sazón', ['2x Hamburguesa', '1x Gaseosa'], 58000,
        'En preparación')
  ];
  @override
  Widget build(BuildContext context) {
    final pages = [
      EventsPage(onOpen: _openTickets),
      const ParkingPage(),
      OrdersPage(orders: _orders, onNewOrder: _openRestaurants),
      const ResaleMarketplacePage(),
    ];
    final titles = ['Eventos', 'Parqueadero', 'Pedidos', 'Reventa'];
    final topInset = MediaQuery.of(context).padding.top;
    return GlassScaffold(
      appBar: GlassAppBar(
        title: Text(titles[_tab]),
        actions: [
          NotificationBellButton(
              unreadCount: _unread, onTap: _openNotifications)
        ],
      ),
      drawer: AppDrawer(
          user: widget.user,
          dark: widget.dark,
          onDarkChanged: widget.onDarkChanged,
          onLogout: widget.onLogout),
      body: Padding(
        padding: EdgeInsets.fromLTRB(0, kToolbarHeight + topInset, 0, 96),
        child: GlassTabSwitcher(tabIndex: _tab, child: pages[_tab]),
      ),
      bottomNavigationBar: GlassNavigationBar(
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
            NavigationDestination(
                icon: Icon(Icons.sell_outlined),
                selectedIcon: Icon(Icons.sell),
                label: 'Reventa'),
          ]),
    );
  }

  void _openTickets(Event event) => Navigator.of(context)
      .push(MaterialPageRoute(builder: (_) => TicketsPage(event: event)));
  void _openRestaurants() => Navigator.of(context).push(MaterialPageRoute(
      builder: (_) => RestaurantsPage(
          onPaid: (order) => setState(() => _orders.insert(0, order)))));
  void _openNotifications() => Navigator.of(context)
      .push(MaterialPageRoute(builder: (_) => const NotificationsPage()))
      .then((_) => setState(() => _unread = 0));
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
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Drawer(
      backgroundColor: scheme.surface.withValues(alpha: dark ? 0.75 : 0.9),
      surfaceTintColor: Colors.transparent,
      child: ListView(children: [
        DrawerHeader(
          decoration: BoxDecoration(
            border: Border(
                bottom: BorderSide(
                    color: scheme.outlineVariant.withValues(alpha: 0.4))),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisAlignment: MainAxisAlignment.end,
            children: [
              CircleAvatar(
                  radius: 26,
                  backgroundColor: scheme.primary.withValues(alpha: 0.22),
                  child: Text(user.name.substring(0, 1),
                      style: TextStyle(
                          color: scheme.primary, fontWeight: FontWeight.w700))),
              const SizedBox(height: 10),
              Text(user.name, style: Theme.of(context).textTheme.titleMedium),
              Text(user.email,
                  style: Theme.of(context).textTheme.bodySmall?.copyWith(
                      color: scheme.onSurface.withValues(alpha: 0.6))),
            ],
          ),
        ),
        ListTile(
          leading: const Icon(Icons.person_outline),
          title: const Text('Perfil'),
          onTap: () => Navigator.of(context)
              .push(MaterialPageRoute(builder: (_) => ProfilePage(user: user))),
        ),
        ListTile(
          leading: const Icon(Icons.receipt_long_outlined),
          title: const Text('Mi actividad'),
          onTap: () => Navigator.of(context)
              .push(MaterialPageRoute(builder: (_) => const ActivityPage())),
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
      ]),
    );
  }
}

class EventsPage extends StatefulWidget {
  const EventsPage({super.key, required this.onOpen});
  final ValueChanged<Event> onOpen;
  @override
  State<EventsPage> createState() => _EventsPageState();
}

class _EventsPageState extends State<EventsPage> {
  final _query = TextEditingController();
  String _category = 'Todos';
  String _dateFilter = 'Todos';
  bool _loadError = false;
  final _rand = Random();

  bool _matchesDate(Event e) {
    if (_dateFilter == 'Todos') return true;
    final now = DateTime.now();
    if (_dateFilter == 'Este mes') {
      return e.day.year == now.year && e.day.month == now.month;
    }
    final until = DateTime(now.year, now.month + 3, now.day);
    return !e.day.isBefore(DateTime(now.year, now.month, now.day)) &&
        e.day.isBefore(until);
  }

  // Simula una recarga real: 1 de cada 4 veces "falla" para poder mostrar
  // (y probar) el estado de error con reintento vía pull-to-refresh.
  Future<void> _refresh() async {
    await Future.delayed(const Duration(milliseconds: 800));
    if (!mounted) return;
    setState(() => _loadError = _rand.nextInt(4) == 0);
  }

  @override
  void dispose() {
    _query.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    final scheme = Theme.of(context).colorScheme;
    final categories = ['Todos', ..._events.map((e) => e.category).toSet()];
    final q = _query.text.trim().toLowerCase();
    final filtered = _events.where((e) {
      final matchesQuery = q.isEmpty ||
          e.name.toLowerCase().contains(q) ||
          e.place.toLowerCase().contains(q);
      final matchesCategory = _category == 'Todos' || e.category == _category;
      return matchesQuery && matchesCategory && _matchesDate(e);
    }).toList();
    final upcoming = filtered.where((e) => !e.past).toList();
    final past = filtered.where((e) => e.past).toList();
    final featured = upcoming.isEmpty ? null : upcoming.first;
    final rest = upcoming.skip(1).toList();
    final noResults = filtered.isEmpty;

    return RefreshIndicator(
        onRefresh: _refresh,
        child: ListView(padding: const EdgeInsets.all(16), children: [
          TextField(
            controller: _query,
            onChanged: (_) => setState(() {}),
            decoration: const InputDecoration(
                hintText: 'Buscar eventos o lugares',
                prefixIcon: Icon(Icons.search)),
          ),
          const SizedBox(height: 12),
          SizedBox(
            height: 38,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              itemCount: categories.length,
              separatorBuilder: (_, __) => const SizedBox(width: 8),
              itemBuilder: (context, i) {
                final cat = categories[i];
                final color = cat == 'Todos'
                    ? scheme.primary
                    : _rowAccents[i % _rowAccents.length];
                final selected = _category == cat;
                return ChoiceChip(
                  label: Text(cat),
                  selected: selected,
                  onSelected: (_) => setState(() => _category = cat),
                  selectedColor: color.withValues(alpha: 0.28),
                  labelStyle: TextStyle(
                      color: selected
                          ? TintedBadge.foreground(
                              color, Theme.of(context).brightness)
                          : scheme.onSurface,
                      fontWeight: FontWeight.w600),
                );
              },
            ),
          ),
          const SizedBox(height: 10),
          SizedBox(
            height: 36,
            child: ListView.separated(
              scrollDirection: Axis.horizontal,
              itemCount: _dateFilters.length,
              separatorBuilder: (_, __) => const SizedBox(width: 8),
              itemBuilder: (context, i) {
                final filter = _dateFilters[i];
                final selected = _dateFilter == filter;
                return ChoiceChip(
                  label: Text(filter),
                  selected: selected,
                  onSelected: (_) => setState(() => _dateFilter = filter),
                  selectedColor: scheme.primary.withValues(alpha: 0.24),
                  labelStyle: TextStyle(
                      color: selected
                          ? TintedBadge.foreground(
                              scheme.primary, Theme.of(context).brightness)
                          : scheme.onSurface,
                      fontWeight: FontWeight.w600),
                );
              },
            ),
          ),
          const SizedBox(height: 18),
          if (_loadError)
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 24),
              child: LiquidGlassCard(
                borderRadius: BorderRadius.circular(28),
                child: Column(children: [
                  Icon(Icons.cloud_off_outlined,
                      size: 40, color: scheme.onSurface.withValues(alpha: 0.5)),
                  const SizedBox(height: 12),
                  Text('No pudimos actualizar los eventos.',
                      textAlign: TextAlign.center, style: textTheme.titleSmall),
                  const SizedBox(height: 4),
                  Text('Desliza hacia abajo para reintentar.',
                      textAlign: TextAlign.center,
                      style: textTheme.bodySmall?.copyWith(
                          color: scheme.onSurface.withValues(alpha: 0.6))),
                ]),
              ),
            )
          else ...[
            if (noResults)
              Padding(
                padding: const EdgeInsets.symmetric(vertical: 32),
                child: Center(
                  child: Text('No encontramos eventos con esos filtros.',
                      style: textTheme.bodyMedium?.copyWith(
                          color: scheme.onSurface.withValues(alpha: 0.6))),
                ),
              ),
            if (featured != null) ...[
              LiquidGlassCard(
                borderRadius: BorderRadius.circular(32),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const TintedBadge(color: _kAmber, child: Text('DESTACADO')),
                    const SizedBox(height: 14),
                    Text(featured.name, style: textTheme.headlineSmall),
                    const SizedBox(height: 6),
                    Text('${featured.date} · ${featured.place}',
                        style: textTheme.bodyMedium?.copyWith(
                            color: scheme.onSurface.withValues(alpha: 0.7))),
                    Text('Desde \$${featured.price}',
                        style: textTheme.bodyMedium?.copyWith(
                            color: scheme.onSurface.withValues(alpha: 0.7))),
                    const SizedBox(height: 18),
                    FilledButton.icon(
                        onPressed: () => widget.onOpen(featured),
                        icon: const Icon(Icons.chevron_right),
                        label: const Text('Ver entradas')),
                  ],
                ),
              ),
              const SizedBox(height: 24),
            ],
            if (rest.isNotEmpty) ...[
              Text('Próximos',
                  style: textTheme.titleSmall?.copyWith(
                      letterSpacing: 0.4,
                      color: scheme.onSurface.withValues(alpha: 0.55))),
              const SizedBox(height: 10),
              for (var i = 0; i < rest.length; i++)
                Padding(
                  padding:
                      EdgeInsets.only(bottom: i == rest.length - 1 ? 0 : 10),
                  child: _EventRow(
                      event: rest[i],
                      color: _rowAccents[i % _rowAccents.length],
                      onTap: () => widget.onOpen(rest[i])),
                ),
              const SizedBox(height: 22),
            ],
            if (past.isNotEmpty) ...[
              Text('Anteriores',
                  style: textTheme.titleSmall?.copyWith(
                      letterSpacing: 0.4,
                      color: scheme.onSurface.withValues(alpha: 0.55))),
              const SizedBox(height: 10),
              for (final event in past)
                _PastEventRow(event: event, onTap: () => widget.onOpen(event)),
            ],
          ],
        ]));
  }
}

class _EventRow extends StatelessWidget {
  const _EventRow(
      {required this.event, required this.color, required this.onTap});
  final Event event;
  final Color color;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final parts = event.date.split(' ');
    return Card(
      child: InkWell(
        borderRadius: BorderRadius.circular(22),
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Row(
            children: [
              TintedDateBadge(
                  day: parts.isNotEmpty ? parts[0] : '',
                  month: parts.length > 1 ? parts[1].toUpperCase() : '',
                  color: color),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(event.name,
                        style: Theme.of(context).textTheme.titleSmall),
                    Text('${event.place} · \$${event.price}',
                        style: Theme.of(context).textTheme.bodySmall?.copyWith(
                            color: scheme.onSurface.withValues(alpha: 0.6))),
                  ],
                ),
              ),
              Icon(Icons.chevron_right,
                  color: scheme.onSurface.withValues(alpha: 0.4)),
            ],
          ),
        ),
      ),
    );
  }
}

class _PastEventRow extends StatelessWidget {
  const _PastEventRow({required this.event, required this.onTap});
  final Event event;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Opacity(
      opacity: 0.65,
      child: Card(
        child: InkWell(
          borderRadius: BorderRadius.circular(22),
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(event.name,
                          style: Theme.of(context).textTheme.titleSmall),
                      Text(event.date,
                          style: Theme.of(context)
                              .textTheme
                              .bodySmall
                              ?.copyWith(
                                  color: scheme.onSurface
                                      .withValues(alpha: 0.55))),
                    ],
                  ),
                ),
                Icon(Icons.history,
                    color: scheme.onSurface.withValues(alpha: 0.4)),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class TicketsPage extends StatefulWidget {
  const TicketsPage({super.key, required this.event});
  final Event event;
  @override
  State<TicketsPage> createState() => _TicketsPageState();
}

const _kTiers = {
  'General': 1.0,
  'Platea Baja': 1.2,
  'Palco VIP': 1.8,
};

class _TicketsPageState extends State<TicketsPage> {
  bool _sent = false;
  String? _code;
  String? _seat;
  String? _ticketId;
  String? _txn;
  String _tier = 'General';
  int _qty = 1;
  final _rand = Random();
  CancellationRequest? _cancellationRequest;

  @override
  void initState() {
    super.initState();
    switch (widget.event.id) {
      case 'evt-1':
        _code = 'HXC-QR-000123';
        _seat = 'Platea Baja · Fila 12 · Silla 34';
        _ticketId = 'TCK-2026-000123';
        _txn = 'TXN-2026-000501';
      case 'evt-2':
        _code = 'HXC-QR-000124';
        _seat = 'General · Fila 3 · Silla 12';
        _ticketId = 'TCK-2026-000124';
        _txn = 'TXN-2026-000502';
      case 'evt-4':
        _code = 'HXC-QR-000099';
        _seat = 'General · Fila 1 · Silla 5';
        _ticketId = 'TCK-2026-000099';
        _txn = 'TXN-2026-000099';
    }
  }

  int get _tierPrice => (widget.event.price * _kTiers[_tier]!).round();
  int get _subtotal => _tierPrice * _qty;

  String _code6() => (100000 + _rand.nextInt(899999)).toString();

  void _openCheckout() {
    var method = 'Tarjeta de crédito o débito';
    final promoCtrl = TextEditingController();
    PromoCode? appliedPromo;
    String? promoError;
    showModalBottomSheet(
        context: context,
        builder: (context) =>
            StatefulBuilder(builder: (context, setSheetState) {
              final discount = appliedPromo == null
                  ? 0
                  : (_subtotal * appliedPromo!.discountPercent / 100).round();
              final total = _subtotal - discount;
              return Padding(
                padding: const EdgeInsets.all(24),
                child: Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      const Text('Resumen de la compra',
                          style: TextStyle(
                              fontSize: 20, fontWeight: FontWeight.w600)),
                      const SizedBox(height: 12),
                      Text('$_tier x $_qty · \$$_subtotal'),
                      const SizedBox(height: 10),
                      Row(children: [
                        Expanded(
                          child: TextField(
                              controller: promoCtrl,
                              textCapitalization: TextCapitalization.characters,
                              decoration: const InputDecoration(
                                  labelText: 'Código promocional (opcional)')),
                        ),
                        const SizedBox(width: 8),
                        OutlinedButton(
                            onPressed: () => setSheetState(() {
                                  final promo = requestsStore.validatePromo(
                                      promoCtrl.text, widget.event.id);
                                  appliedPromo = promo;
                                  promoError = promo == null &&
                                          promoCtrl.text.trim().isNotEmpty
                                      ? 'Código inválido'
                                      : null;
                                }),
                            child: const Text('Aplicar')),
                      ]),
                      if (promoError != null)
                        Padding(
                          padding: const EdgeInsets.only(top: 4),
                          child: Text(promoError!,
                              style: const TextStyle(color: _kRed)),
                        ),
                      if (appliedPromo != null)
                        Padding(
                          padding: const EdgeInsets.only(top: 4),
                          child: Text(
                              '${appliedPromo!.code} aplicado · -${appliedPromo!.discountPercent}%',
                              style: const TextStyle(color: _kGreen)),
                        ),
                      const Divider(),
                      Text('Total: \$$total',
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
                      const SizedBox(height: 8),
                      LoadingFilledButton(
                          label: 'Confirmar pago',
                          onPressed: () async {
                            await apiClient.confirmPayment(
                                amount: total, method: method);
                            if (!context.mounted) return;
                            Navigator.pop(context);
                            _confirmPurchase(total);
                          })
                    ]),
              );
            }));
  }

  void _confirmPurchase(int total) {
    setState(() {
      _code = 'HXC-QR-${_code6()}';
      _ticketId = 'TCK-2026-${_code6()}';
      _txn = 'TXN-2026-${_code6()}';
      _seat = '$_tier · Cantidad: $_qty';
      _sent = false;
      _cancellationRequest = null;
    });
    activityLog.add(ActivityEntry(
        type: ActivityType.ticket,
        title: widget.event.name,
        subtitle: '$_tier · Cantidad: $_qty',
        amount: total));
  }

  void _requestCancellation() {
    final reason = TextEditingController();
    showDialog(
        context: context,
        builder: (context) => AlertDialog(
                title: const Text('Solicitar cancelación'),
                content: TextField(
                    controller: reason,
                    maxLines: 2,
                    decoration: const InputDecoration(labelText: 'Motivo')),
                actions: [
                  TextButton(
                      onPressed: () => Navigator.pop(context),
                      child: const Text('Cancelar')),
                  FilledButton(
                      onPressed: () {
                        if (reason.text.trim().isEmpty) return;
                        final request = CancellationRequest(
                            eventName: widget.event.name,
                            ticketCode: _code!,
                            reason: reason.text.trim());
                        requestsStore.submitCancellation(request);
                        setState(() => _cancellationRequest = request);
                        Navigator.pop(context);
                      },
                      child: const Text('Enviar solicitud'))
                ]));
  }

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
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    final scheme = Theme.of(context).colorScheme;
    return GlassScaffold(
      appBar: const GlassAppBar(title: Text('Mis entradas')),
      body: ListView(
        padding: EdgeInsets.fromLTRB(16,
            kToolbarHeight + MediaQuery.of(context).padding.top + 20, 16, 24),
        children: [
          Text(widget.event.name, style: textTheme.headlineSmall),
          const SizedBox(height: 4),
          Text('${widget.event.date} · ${widget.event.place}',
              style: textTheme.bodyMedium
                  ?.copyWith(color: scheme.onSurface.withValues(alpha: 0.65))),
          const SizedBox(height: 24),
          if (_code == null)
            LiquidGlassCard(
              borderRadius: BorderRadius.circular(28),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text('Elige tu boletería', style: textTheme.titleMedium),
                  const SizedBox(height: 10),
                  Material(
                      type: MaterialType.transparency,
                      child: RadioGroup<String>(
                        groupValue: _tier,
                        onChanged: (value) => setState(() => _tier = value!),
                        child: Column(children: [
                          for (final tier in _kTiers.keys)
                            RadioListTile<String>(
                              contentPadding: EdgeInsets.zero,
                              value: tier,
                              title: Text(tier),
                              subtitle: Text(
                                  '\$${(widget.event.price * _kTiers[tier]!).round()}'),
                            ),
                        ]),
                      )),
                  const SizedBox(height: 8),
                  Row(
                    children: [
                      Text('Cantidad', style: textTheme.bodyMedium),
                      const Spacer(),
                      IconButton(
                          onPressed:
                              _qty > 1 ? () => setState(() => _qty--) : null,
                          icon: const Icon(Icons.remove_circle_outline)),
                      Text('$_qty', style: textTheme.titleSmall),
                      IconButton(
                          onPressed:
                              _qty < 4 ? () => setState(() => _qty++) : null,
                          icon: const Icon(Icons.add_circle_outline)),
                    ],
                  ),
                  const DashedDivider(),
                  const SizedBox(height: 12),
                  Row(
                    children: [
                      Text('Subtotal', style: textTheme.bodyMedium),
                      const Spacer(),
                      Text('\$$_subtotal', style: textTheme.titleMedium),
                    ],
                  ),
                  const SizedBox(height: 16),
                  FilledButton.icon(
                      onPressed: _openCheckout,
                      icon: const Icon(Icons.confirmation_number_outlined),
                      label: const Text('Comprar entradas')),
                ],
              ),
            )
          else
            AnimatedBuilder(
              animation: requestsStore,
              builder: (context, _) {
                final cancellation = _cancellationRequest;
                if (cancellation?.status == RequestStatus.approved) {
                  return LiquidGlassCard(
                    borderRadius: BorderRadius.circular(32),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        const TintedIconBadge(
                            icon: Icons.check_circle_outline,
                            color: _kGreen,
                            size: 52),
                        const SizedBox(height: 14),
                        Text('Entrada cancelada', style: textTheme.titleLarge),
                        const SizedBox(height: 6),
                        Text('Reembolso procesado a tu medio de pago original.',
                            style: textTheme.bodyMedium?.copyWith(
                                color:
                                    scheme.onSurface.withValues(alpha: 0.7))),
                      ],
                    ),
                  );
                }
                final isPending = cancellation?.status == RequestStatus.pending;
                final isRejected =
                    cancellation?.status == RequestStatus.rejected;
                return LiquidGlassCard(
                  borderRadius: BorderRadius.circular(32),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      if (isPending) ...[
                        const Align(
                          alignment: Alignment.centerLeft,
                          child: StatusChip(
                              label: 'Cancelación en revisión',
                              color: _kAmber,
                              icon: Icons.hourglass_top),
                        ),
                        const SizedBox(height: 14),
                      ],
                      if (isRejected) ...[
                        Text('Tu solicitud de cancelación fue rechazada.',
                            style: textTheme.bodySmall?.copyWith(color: _kRed)),
                        const SizedBox(height: 12),
                      ],
                      Center(
                        child: Container(
                          width: 180,
                          height: 180,
                          alignment: Alignment.center,
                          decoration: BoxDecoration(
                              color: _kPaper,
                              borderRadius: BorderRadius.circular(20)),
                          child: const Icon(Icons.qr_code_2,
                              size: 130, color: _kInk),
                        ),
                      ),
                      const SizedBox(height: 14),
                      Center(
                        child: Text(_code!,
                            style: const TextStyle(
                                fontFamily: 'monospace',
                                fontWeight: FontWeight.w700,
                                fontSize: 16,
                                letterSpacing: 1.2)),
                      ),
                      const SizedBox(height: 18),
                      const DashedDivider(),
                      const SizedBox(height: 18),
                      Center(
                        child: Column(
                          children: [
                            Text(_seat ?? '',
                                style: textTheme.bodyMedium
                                    ?.copyWith(fontWeight: FontWeight.w600)),
                            const SizedBox(height: 4),
                            Text('Ticket: $_ticketId',
                                style: textTheme.bodySmall?.copyWith(
                                    color: scheme.onSurface
                                        .withValues(alpha: 0.55))),
                            Text('Transacción: $_txn',
                                style: textTheme.bodySmall?.copyWith(
                                    color: scheme.onSurface
                                        .withValues(alpha: 0.55))),
                          ],
                        ),
                      ),
                      const SizedBox(height: 20),
                      FilledButton.icon(
                          onPressed: isPending ? null : _send,
                          icon: const Icon(Icons.send_outlined),
                          label: Text(
                              _sent ? 'Entrada enviada' : 'Enviar entrada')),
                      if (!isPending) ...[
                        const SizedBox(height: 8),
                        Center(
                          child: TextButton(
                              onPressed: _requestCancellation,
                              child: const Text('Solicitar cancelación')),
                        ),
                      ],
                    ],
                  ),
                );
              },
            ),
        ],
      ),
    );
  }
}

class ParkingPage extends StatefulWidget {
  const ParkingPage({super.key});
  @override
  State<ParkingPage> createState() => _ParkingPageState();
}

const _kParkingZones = {
  'Zona A': 25000,
  'Zona B': 18000,
  'Zona VIP': 40000,
};

class _ParkingPageState extends State<ParkingPage> {
  bool _validated = false;
  bool _directions = false;
  final _rand = Random();

  // Reserva precargada de demo (evento/zona/espacio/código), igual que las
  // entradas demo de TicketsPage — así la pantalla no arranca vacía.
  Event? _event = _events.first;
  String? _zone = 'Zona B';
  String? _space = 'B-04';
  String? _code = 'HXC-PARK-000045';

  String _code6() => (100000 + _rand.nextInt(899999)).toString();

  void _openCheckout() {
    var method = 'Tarjeta de crédito o débito';
    final price = _kParkingZones[_zone]!;
    showModalBottomSheet(
        context: context,
        builder: (context) => StatefulBuilder(
            builder: (context, setSheetState) => Padding(
                padding: const EdgeInsets.all(24),
                child: Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      const Text('Resumen de la reserva',
                          style: TextStyle(
                              fontSize: 20, fontWeight: FontWeight.w600)),
                      const SizedBox(height: 12),
                      Text('${_event!.name} · $_zone · \$$price'),
                      const Divider(),
                      Text('Total: \$$price',
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
                      const SizedBox(height: 8),
                      LoadingFilledButton(
                          label: 'Confirmar pago',
                          onPressed: () async {
                            await Future.delayed(
                                const Duration(milliseconds: 800));
                            if (!context.mounted) return;
                            Navigator.pop(context);
                            _confirmReservation();
                          })
                    ]))));
  }

  void _confirmReservation() {
    const letters = 'ABCD';
    final space =
        '${letters[_rand.nextInt(letters.length)]}-${(1 + _rand.nextInt(20)).toString().padLeft(2, '0')}';
    final price = _kParkingZones[_zone]!;
    setState(() {
      _space = space;
      _code = 'HXC-PARK-${_code6()}';
      _validated = false;
      _directions = false;
    });
    activityLog.add(ActivityEntry(
        type: ActivityType.parking,
        title: _event!.name,
        subtitle: '$_zone · Espacio $space',
        amount: price));
  }

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    final scheme = Theme.of(context).colorScheme;
    return ListView(padding: const EdgeInsets.all(16), children: [
      Text('Tu reserva', style: textTheme.titleLarge),
      const SizedBox(height: 12),
      if (_code == null)
        LiquidGlassCard(
          borderRadius: BorderRadius.circular(28),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text('Reserva tu parqueadero', style: textTheme.titleMedium),
              const SizedBox(height: 10),
              Material(
                  type: MaterialType.transparency,
                  child: RadioGroup<Event>(
                    groupValue: _event,
                    onChanged: (value) => setState(() => _event = value),
                    child: Column(children: [
                      for (final event in _events.where((e) => !e.past))
                        RadioListTile<Event>(
                          contentPadding: EdgeInsets.zero,
                          value: event,
                          title: Text(event.name),
                          subtitle: Text(event.place),
                        ),
                    ]),
                  )),
              const SizedBox(height: 8),
              Text('Elige zona', style: textTheme.bodyMedium),
              Material(
                  type: MaterialType.transparency,
                  child: RadioGroup<String>(
                    groupValue: _zone,
                    onChanged: (value) => setState(() => _zone = value),
                    child: Column(children: [
                      for (final zone in _kParkingZones.keys)
                        RadioListTile<String>(
                          contentPadding: EdgeInsets.zero,
                          value: zone,
                          title: Text(zone),
                          subtitle: Text('\$${_kParkingZones[zone]}'),
                        ),
                    ]),
                  )),
              const SizedBox(height: 8),
              FilledButton.icon(
                  onPressed:
                      _event == null || _zone == null ? null : _openCheckout,
                  icon: const Icon(Icons.local_parking_outlined),
                  label: const Text('Reservar parqueadero')),
            ],
          ),
        )
      else
        LiquidGlassCard(
          borderRadius: BorderRadius.circular(32),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Row(children: [
                const TintedIconBadge(
                    icon: Icons.local_parking, color: _kIndigo),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(_event!.name, style: textTheme.titleSmall),
                      Text(_event!.place,
                          style: textTheme.bodySmall?.copyWith(
                              color: scheme.onSurface.withValues(alpha: 0.6))),
                    ],
                  ),
                ),
              ]),
              const SizedBox(height: 18),
              const DashedDivider(),
              const SizedBox(height: 18),
              Align(
                  alignment: Alignment.centerLeft,
                  child: TintedBadge(
                      color: _kIndigo,
                      child:
                          Text('${_zone!.toUpperCase()} · ESPACIO $_space'))),
              const SizedBox(height: 20),
              Center(
                child: Container(
                  width: 150,
                  height: 150,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                      color: _kPaper, borderRadius: BorderRadius.circular(20)),
                  child: const Icon(Icons.qr_code_2, size: 110, color: _kInk),
                ),
              ),
              const SizedBox(height: 10),
              Center(
                  child: Text(_code!,
                      style: const TextStyle(
                          fontFamily: 'monospace',
                          fontWeight: FontWeight.w700,
                          letterSpacing: 1.2))),
              const SizedBox(height: 20),
              OutlinedButton.icon(
                  onPressed: () => setState(() => _directions = true),
                  icon: const Icon(Icons.directions),
                  label: const Text('Cómo llegar')),
              if (_directions)
                Padding(
                    padding: const EdgeInsets.only(top: 8),
                    child: Text('Abriendo ruta a ${_event!.place}.',
                        style: textTheme.bodySmall)),
              const SizedBox(height: 12),
              if (!_validated)
                FilledButton(
                    onPressed: () => setState(() => _validated = true),
                    child: const Text('Simular validación de ingreso'))
              else
                const Align(
                  alignment: Alignment.centerLeft,
                  child: StatusChip(
                      label: 'Ingreso validado · 0 h 0 min',
                      color: _kGreen,
                      icon: Icons.timer_outlined),
                ),
            ],
          ),
        ),
    ]);
  }
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
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    final scheme = Theme.of(context).colorScheme;
    return ListView(padding: const EdgeInsets.all(16), children: [
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
      const SizedBox(height: 14),
      if (!_mine) ...[
        FilledButton.icon(
            onPressed: widget.onNewOrder,
            icon: const Icon(Icons.add),
            label: const Text('Ver restaurantes')),
        const SizedBox(height: 12),
        const _SectionCard(
            title: 'Food Truck La Sazón',
            lines: ['Comida rápida'],
            icon: Icons.fastfood,
            color: _kAmber),
        const _SectionCard(
            title: 'Cafetería Central',
            lines: ['Café y repostería'],
            icon: Icons.coffee,
            color: _kCyan),
        const _SectionCard(
            title: 'Cervecería del Parche',
            lines: ['Cerveza artesanal y piqueos'],
            icon: Icons.sports_bar,
            color: _kPink)
      ] else if (widget.orders.isEmpty)
        Text('Aún no tienes pedidos.',
            style: textTheme.bodyMedium
                ?.copyWith(color: scheme.onSurface.withValues(alpha: 0.6)))
      else
        ...widget.orders.map((order) => Card(
              child: Padding(
                padding: const EdgeInsets.all(14),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const TintedIconBadge(
                        icon: Icons.receipt_long, color: _kIndigo),
                    const SizedBox(width: 14),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(order.store, style: textTheme.titleSmall),
                          Text(order.items.join(' · '),
                              style: textTheme.bodySmall?.copyWith(
                                  color:
                                      scheme.onSurface.withValues(alpha: 0.6))),
                          const SizedBox(height: 8),
                          StatusChip(label: order.status, color: _kAmber),
                        ],
                      ),
                    ),
                    const SizedBox(width: 8),
                    Text('\$${order.total}', style: textTheme.titleSmall),
                  ],
                ),
              ),
            )),
    ]);
  }
}

(IconData, Color) _storeStyle(String store) => switch (store) {
      'Food Truck La Sazón' => (Icons.fastfood, _kAmber),
      'Cafetería Central' => (Icons.coffee, _kCyan),
      'Cervecería del Parche' => (Icons.sports_bar, _kPink),
      _ => (Icons.storefront, _kIndigo),
    };

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
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    return GlassScaffold(
      appBar: const GlassAppBar(title: Text('Restaurantes')),
      body: ListView(
          padding: EdgeInsets.fromLTRB(16,
              kToolbarHeight + MediaQuery.of(context).padding.top + 20, 16, 16),
          children: _stores.entries.expand((store) {
            final style = _storeStyle(store.key);
            return [
              Padding(
                  padding: const EdgeInsets.only(top: 12, bottom: 8),
                  child: Row(children: [
                    TintedIconBadge(icon: style.$1, color: style.$2, size: 38),
                    const SizedBox(width: 10),
                    Text(store.key, style: textTheme.titleMedium),
                  ])),
              ...store.value.map((product) => Card(
                  child: ListTile(
                      enabled: product.available,
                      title: Text(product.name),
                      subtitle: Text(
                          '\$${product.price}${product.available ? '' : ' · No disponible'}'),
                      trailing: product.available
                          ? Row(mainAxisSize: MainAxisSize.min, children: [
                              if (_cart.containsKey(product))
                                IconButton(
                                    icon:
                                        const Icon(Icons.remove_circle_outline),
                                    onPressed: () => setState(() {
                                          final count = _cart[product]!;
                                          if (count == 1) {
                                            _cart.remove(product);
                                          } else {
                                            _cart[product] = count - 1;
                                          }
                                        })),
                              if (_cart.containsKey(product))
                                Text('${_cart[product]}'),
                              IconButton(
                                  icon: const Icon(Icons.add_circle_outline),
                                  onPressed: () => setState(() =>
                                      _cart[product] =
                                          (_cart[product] ?? 0) + 1))
                            ])
                          : null))),
            ];
          }).toList()),
      bottomNavigationBar: _cart.isEmpty
          ? null
          : SafeArea(
              child: Padding(
                  padding: const EdgeInsets.all(12),
                  child: FilledButton(
                      onPressed: _checkout,
                      child: Text('Continuar al pago · \$$_total')))),
    );
  }

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
                      LoadingFilledButton(
                          label: 'Confirmar pago',
                          onPressed: () async {
                            await Future.delayed(
                                const Duration(milliseconds: 800));
                            if (!context.mounted) return;
                            Navigator.pop(context);
                            _confirmPayment();
                          })
                    ]))));
  }

  void _confirmPayment() {
    final store =
        _stores.entries.firstWhere((s) => s.value.any(_cart.containsKey)).key;
    final items =
        _cart.entries.map((e) => '${e.value}x ${e.key.name}').toList();
    widget.onPaid(Order(store, items, _total, 'En preparación'));
    activityLog.add(ActivityEntry(
        type: ActivityType.order,
        title: store,
        subtitle: items.join(' · '),
        amount: _total));
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
  int _unread = 3;
  @override
  Widget build(BuildContext context) {
    final pages = _staffPages(widget.user);
    final current = pages[_tab];
    final topInset = MediaQuery.of(context).padding.top;
    return GlassScaffold(
        appBar: GlassAppBar(
          title: Text(current.title),
          actions: [
            NotificationBellButton(
                unreadCount: _unread, onTap: _openNotifications)
          ],
        ),
        drawer: AppDrawer(
            user: widget.user,
            dark: widget.dark,
            onDarkChanged: widget.onDarkChanged,
            onLogout: widget.onLogout),
        body: Padding(
          padding: EdgeInsets.fromLTRB(0, kToolbarHeight + topInset, 0, 96),
          child: GlassTabSwitcher(tabIndex: _tab, child: current.page),
        ),
        bottomNavigationBar: GlassNavigationBar(
            selectedIndex: _tab,
            onDestinationSelected: (i) => setState(() => _tab = i),
            destinations: pages
                .map((page) => NavigationDestination(
                    icon: Icon(page.icon), label: page.title))
                .toList()));
  }

  void _openNotifications() => Navigator.of(context)
      .push(MaterialPageRoute(builder: (_) => const NotificationsPage()))
      .then((_) => setState(() => _unread = 0));
}

class StaffDestination {
  const StaffDestination(this.title, this.icon, this.page);
  final String title;
  final IconData icon;
  final Widget page;
}

List<StaffDestination> _staffPages(User user) {
  final position = user.position;
  if (position == 'Jefe de personal') {
    return [
      const StaffDestination(
          'Validar personal', Icons.badge_outlined, PersonnelValidationPage()),
      const StaffDestination(
          'Promociones', Icons.local_offer_outlined, PromotionsPage()),
      const StaffDestination(
          'Solicitudes', Icons.rule_folder_outlined, RequestsReviewPage()),
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
    StaffDestination(
        'Turnos', Icons.schedule_outlined, ShiftsPage(employeeName: user.name)),
    const StaffDestination(
        'Asistencia', Icons.how_to_reg_outlined, AttendancePage()),
    operational,
    const StaffDestination(
        'Incidentes', Icons.report_outlined, IncidentsPage()),
    StaffDestination('Emergencia', Icons.warning_amber_outlined,
        EmergencyPage(position: position)),
  ];
}

class PromotionsPage extends StatefulWidget {
  const PromotionsPage({super.key});
  @override
  State<PromotionsPage> createState() => _PromotionsPageState();
}

class _PromotionsPageState extends State<PromotionsPage> {
  final _code = TextEditingController();
  final _discount = TextEditingController();
  Event? _event;

  @override
  void dispose() {
    _code.dispose();
    _discount.dispose();
    super.dispose();
  }

  void _create() {
    final code = _code.text.trim().toUpperCase();
    final discount = int.tryParse(_discount.text.trim());
    if (code.isEmpty || discount == null || discount <= 0 || discount > 100) {
      return;
    }
    requestsStore.createPromoCode(
        PromoCode(code: code, discountPercent: discount, eventId: _event?.id));
    _code.clear();
    _discount.clear();
    setState(() => _event = null);
  }

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    final scheme = Theme.of(context).colorScheme;
    return AnimatedBuilder(
      animation: requestsStore,
      builder: (context, _) => ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Text('Crear código promocional', style: textTheme.titleMedium),
          const SizedBox(height: 10),
          LiquidGlassCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                TextField(
                    controller: _code,
                    textCapitalization: TextCapitalization.characters,
                    decoration: const InputDecoration(labelText: 'Código')),
                const SizedBox(height: 12),
                TextField(
                    controller: _discount,
                    keyboardType: TextInputType.number,
                    decoration:
                        const InputDecoration(labelText: 'Descuento (%)')),
                const SizedBox(height: 12),
                DropdownButtonFormField<Event?>(
                  initialValue: _event,
                  decoration: const InputDecoration(labelText: 'Evento'),
                  items: [
                    const DropdownMenuItem(
                        value: null, child: Text('Todos los eventos')),
                    for (final event in _events.where((e) => !e.past))
                      DropdownMenuItem(value: event, child: Text(event.name)),
                  ],
                  onChanged: (value) => setState(() => _event = value),
                ),
                const SizedBox(height: 12),
                FilledButton.icon(
                    onPressed: _create,
                    icon: const Icon(Icons.add),
                    label: const Text('Crear código')),
              ],
            ),
          ),
          const SizedBox(height: 24),
          Text('Códigos existentes', style: textTheme.titleMedium),
          const SizedBox(height: 10),
          if (requestsStore.promoCodes.isEmpty)
            Text('Aún no has creado códigos.',
                style: textTheme.bodyMedium
                    ?.copyWith(color: scheme.onSurface.withValues(alpha: 0.6)))
          else
            for (final promo in requestsStore.promoCodes)
              Card(
                child: ListTile(
                  title: Text(promo.code),
                  subtitle: Text(
                      '${promo.discountPercent}% · ${promo.eventId == null ? 'Todos los eventos' : _events.firstWhere((e) => e.id == promo.eventId, orElse: () => _events.first).name}'),
                  trailing: Switch(
                      value: promo.active,
                      onChanged: (_) => requestsStore.togglePromoCode(promo)),
                ),
              ),
        ],
      ),
    );
  }
}

class RequestsReviewPage extends StatelessWidget {
  const RequestsReviewPage({super.key});

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    final scheme = Theme.of(context).colorScheme;
    return AnimatedBuilder(
      animation: requestsStore,
      builder: (context, _) {
        final pendingCancellations = requestsStore.cancellations
            .where((c) => c.status == RequestStatus.pending)
            .toList();
        final pendingShifts = requestsStore.shiftChanges
            .where((s) => s.status == RequestStatus.pending)
            .toList();
        if (pendingCancellations.isEmpty && pendingShifts.isEmpty) {
          return Center(
            child: Text('No hay solicitudes pendientes.',
                style: textTheme.bodyMedium
                    ?.copyWith(color: scheme.onSurface.withValues(alpha: 0.6))),
          );
        }
        return ListView(padding: const EdgeInsets.all(16), children: [
          if (pendingCancellations.isNotEmpty) ...[
            Text('Cancelaciones de entradas', style: textTheme.titleMedium),
            const SizedBox(height: 8),
            for (final request in pendingCancellations)
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(14),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(request.eventName, style: textTheme.titleSmall),
                      Text('${request.ticketCode} · ${request.reason}',
                          style: textTheme.bodySmall?.copyWith(
                              color: scheme.onSurface.withValues(alpha: 0.65))),
                      const SizedBox(height: 10),
                      Row(children: [
                        Expanded(
                          child: OutlinedButton(
                              onPressed: () {
                                requestsStore.resolveCancellation(
                                    request, false);
                                activityLog.add(ActivityEntry(
                                    type: ActivityType.cancellation,
                                    title: request.eventName,
                                    subtitle:
                                        'Solicitud de cancelación rechazada',
                                    amount: 0));
                              },
                              child: const Text('Rechazar')),
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: FilledButton(
                              onPressed: () {
                                requestsStore.resolveCancellation(
                                    request, true);
                                activityLog.add(ActivityEntry(
                                    type: ActivityType.cancellation,
                                    title: request.eventName,
                                    subtitle: 'Entrada cancelada y reembolsada',
                                    amount: 0));
                              },
                              child: const Text('Aprobar')),
                        ),
                      ]),
                    ],
                  ),
                ),
              ),
            const SizedBox(height: 20),
          ],
          if (pendingShifts.isNotEmpty) ...[
            Text('Cambios de turno', style: textTheme.titleMedium),
            const SizedBox(height: 8),
            for (final request in pendingShifts)
              Card(
                child: Padding(
                  padding: const EdgeInsets.all(14),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(request.employeeName, style: textTheme.titleSmall),
                      Text('${request.currentShift} → ${request.desiredShift}',
                          style: textTheme.bodySmall),
                      Text(request.reason,
                          style: textTheme.bodySmall?.copyWith(
                              color: scheme.onSurface.withValues(alpha: 0.65))),
                      const SizedBox(height: 10),
                      Row(children: [
                        Expanded(
                          child: OutlinedButton(
                              onPressed: () {
                                requestsStore.resolveShiftChange(
                                    request, false);
                                activityLog.add(ActivityEntry(
                                    type: ActivityType.shiftChange,
                                    title: request.employeeName,
                                    subtitle: 'Cambio de turno rechazado',
                                    amount: 0));
                              },
                              child: const Text('Rechazar')),
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: FilledButton(
                              onPressed: () {
                                requestsStore.resolveShiftChange(request, true);
                                activityLog.add(ActivityEntry(
                                    type: ActivityType.shiftChange,
                                    title: request.employeeName,
                                    subtitle: 'Cambio de turno aprobado',
                                    amount: 0));
                              },
                              child: const Text('Aprobar')),
                        ),
                      ]),
                    ],
                  ),
                ),
              ),
          ],
        ]);
      },
    );
  }
}

class _Shift {
  const _Shift(this.event, this.zone, this.schedule, this.color);
  final String event, zone, schedule;
  final Color color;
}

const _kShifts = [
  _Shift('HEXACORE Fest 2026', 'Puerta Norte',
      '12 dic 2026 · 3:00 p. m. – 11:00 p. m.', _kPink),
  _Shift('Noche de Rock Nacional', 'Zona de Parqueadero',
      '20 sep 2026 · 5:00 p. m. – 10:00 p. m.', _kCyan),
];

class ShiftsPage extends StatefulWidget {
  const ShiftsPage({super.key, required this.employeeName});
  final String employeeName;
  @override
  State<ShiftsPage> createState() => _ShiftsPageState();
}

class _ShiftsPageState extends State<ShiftsPage> {
  final _requests = <int, ShiftChangeRequest>{};

  void _requestChange(int index) {
    final desired = TextEditingController();
    final reason = TextEditingController();
    showDialog(
        context: context,
        builder: (context) => AlertDialog(
              title: const Text('Solicitar cambio de turno'),
              content: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  TextField(
                      controller: desired,
                      decoration: const InputDecoration(
                          labelText: 'Turno/horario deseado')),
                  const SizedBox(height: 10),
                  TextField(
                      controller: reason,
                      maxLines: 2,
                      decoration: const InputDecoration(labelText: 'Motivo')),
                ],
              ),
              actions: [
                TextButton(
                    onPressed: () => Navigator.pop(context),
                    child: const Text('Cancelar')),
                FilledButton(
                    onPressed: () {
                      if (desired.text.trim().isEmpty ||
                          reason.text.trim().isEmpty) {
                        return;
                      }
                      final request = ShiftChangeRequest(
                          employeeName: widget.employeeName,
                          currentShift:
                              '${_kShifts[index].event} · ${_kShifts[index].schedule}',
                          desiredShift: desired.text.trim(),
                          reason: reason.text.trim());
                      requestsStore.submitShiftChange(request);
                      activityLog.add(ActivityEntry(
                          type: ActivityType.shiftChange,
                          title: _kShifts[index].event,
                          subtitle: 'Cambio de turno solicitado',
                          amount: 0));
                      setState(() => _requests[index] = request);
                      Navigator.pop(context);
                    },
                    child: const Text('Enviar solicitud'))
              ],
            ));
  }

  @override
  Widget build(BuildContext context) => AnimatedBuilder(
        animation: requestsStore,
        builder: (context, _) => ListView(
          padding: const EdgeInsets.all(16),
          children: [
            for (var i = 0; i < _kShifts.length; i++) ...[
              _SectionCard(
                  title: _kShifts[i].event,
                  lines: [_kShifts[i].zone, _kShifts[i].schedule],
                  icon: Icons.event_available,
                  color: _kShifts[i].color),
              const SizedBox(height: 6),
              Align(
                alignment: Alignment.centerLeft,
                child: _requests[i] == null
                    ? TextButton(
                        onPressed: () => _requestChange(i),
                        child: const Text('Solicitar cambio'))
                    : StatusChip(
                        label: switch (_requests[i]!.status) {
                          RequestStatus.pending => 'Cambio solicitado',
                          RequestStatus.approved => 'Cambio aprobado',
                          RequestStatus.rejected => 'Cambio rechazado',
                        },
                        color: switch (_requests[i]!.status) {
                          RequestStatus.pending => _kAmber,
                          RequestStatus.approved => _kGreen,
                          RequestStatus.rejected => _kRed,
                        }),
              ),
              const SizedBox(height: 12),
            ],
          ],
        ),
      );
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
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    return ListView(padding: const EdgeInsets.all(16), children: [
      const _SectionCard(
          title: 'HEXACORE Fest 2026',
          lines: ['Puerta Norte', '12 dic 2026 · 3:00 p. m. – 11:00 p. m.'],
          icon: Icons.schedule),
      const SizedBox(height: 12),
      LiquidGlassCard(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Align(
              alignment: Alignment.centerLeft,
              child: StatusChip(
                label: _entry == null
                    ? 'Sin registrar'
                    : _exit == null
                        ? 'En turno desde $_entry'
                        : 'Turno finalizado',
                color: _entry == null
                    ? _kAmber
                    : _exit == null
                        ? _kGreen
                        : _kIndigo,
                icon: Icons.schedule,
              ),
            ),
            const SizedBox(height: 14),
            if (_entry == null)
              FilledButton(
                  onPressed: () => setState(() => _entry = _time),
                  child: const Text('Registrar entrada'))
            else if (_exit == null)
              FilledButton(
                  onPressed: () => setState(() {
                        _exit = _time;
                        activityLog.add(ActivityEntry(
                            type: ActivityType.attendance,
                            title: 'HEXACORE Fest 2026',
                            subtitle: 'Entrada: $_entry · Salida: $_exit',
                            amount: 0));
                      }),
                  child: const Text('Registrar salida'))
            else
              Text('Entrada: $_entry · Salida: $_exit',
                  style: textTheme.bodyMedium),
          ],
        ),
      ),
    ]);
  }
}

const _kEventCapacity = 5000;

class EntryValidationPage extends StatefulWidget {
  const EntryValidationPage({super.key});
  @override
  State<EntryValidationPage> createState() => _EntryValidationPageState();
}

class _EntryValidationPageState extends State<EntryValidationPage> {
  int? _selected;
  int _admitted = 1180;
  final _entries = [
    'HXC-QR-000123 · Platea Baja',
    'HXC-QR-000201 · General',
    'HXC-QR-000202 · Palco VIP'
  ];
  final _valid = <int>{};

  Future<void> _scan() async {
    final value = await showQrScannerSheet(context, title: 'Escanear entrada');
    if (value == null || !mounted) return;
    final upper = value.toUpperCase();
    final idx = _entries
        .indexWhere((e) => upper.contains(e.split(' · ').first.toUpperCase()));
    if (idx == -1) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
          content:
              Text('Código no reconocido en la demo, mostrando un ejemplo.')));
    }
    setState(() => _selected = idx == -1 ? 0 : idx);
  }

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    final scheme = Theme.of(context).colorScheme;
    final ratio = _admitted / _kEventCapacity;
    return ListView(padding: const EdgeInsets.all(16), children: [
      LiquidGlassCard(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(children: [
              Text('Aforo', style: textTheme.titleSmall),
              const Spacer(),
              Text('$_admitted/$_kEventCapacity',
                  style: textTheme.titleSmall
                      ?.copyWith(fontWeight: FontWeight.w700)),
            ]),
            const SizedBox(height: 10),
            ClipRRect(
              borderRadius: BorderRadius.circular(6),
              child: LinearProgressIndicator(
                value: ratio.clamp(0, 1),
                minHeight: 8,
                backgroundColor: scheme.outlineVariant.withValues(alpha: 0.3),
                color: ratio > 0.9 ? _kRed : _kIndigo,
              ),
            ),
          ],
        ),
      ),
      const SizedBox(height: 16),
      FilledButton.icon(
          onPressed: _scan,
          icon: const Icon(Icons.qr_code_scanner),
          label: const Text('Escanear entrada')),
      const SizedBox(height: 16),
      if (_selected == null)
        Text('Escanea el QR de una boleta para revisar su validez.',
            style: textTheme.bodyMedium
                ?.copyWith(color: scheme.onSurface.withValues(alpha: 0.6)))
      else
        LiquidGlassCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text('HEXACORE Fest 2026', style: textTheme.titleMedium),
              const SizedBox(height: 4),
              Text(_entries[_selected!],
                  style: const TextStyle(
                      fontFamily: 'monospace', letterSpacing: 0.4)),
              const SizedBox(height: 14),
              Align(
                alignment: Alignment.centerLeft,
                child: StatusChip(
                    label: _valid.contains(_selected)
                        ? 'Entrada validada'
                        : 'Entrada válida',
                    color: _valid.contains(_selected) ? _kGreen : _kAmber,
                    icon: _valid.contains(_selected)
                        ? Icons.check_circle_outline
                        : Icons.info_outline),
              ),
              const SizedBox(height: 14),
              if (!_valid.contains(_selected))
                LoadingFilledButton(
                    label: 'Validar ingreso',
                    onPressed: () async {
                      await Future.delayed(const Duration(milliseconds: 400));
                      if (_networkGlitch()) {
                        if (!context.mounted) return;
                        ScaffoldMessenger.of(context).showSnackBar(
                            const SnackBar(content: Text(_kConnectionError)));
                        return;
                      }
                      setState(() {
                        _valid.add(_selected!);
                        _admitted++;
                      });
                    }),
              const SizedBox(height: 8),
              OutlinedButton(
                  onPressed: () => setState(() => _selected = null),
                  child: const Text('Escanear otra')),
            ],
          ),
        ),
    ]);
  }
}

const _kParkingCapacity = 40;

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
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    final scheme = Theme.of(context).colorScheme;
    final occupied = _inside.where((v) => !_departed.contains(v.code)).length;
    final ratio = occupied / _kParkingCapacity;
    return ListView(padding: const EdgeInsets.all(16), children: [
      LiquidGlassCard(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(children: [
              Text('Ocupación', style: textTheme.titleSmall),
              const Spacer(),
              Text('$occupied/$_kParkingCapacity',
                  style: textTheme.titleSmall
                      ?.copyWith(fontWeight: FontWeight.w700)),
            ]),
            const SizedBox(height: 10),
            ClipRRect(
              borderRadius: BorderRadius.circular(6),
              child: LinearProgressIndicator(
                value: ratio.clamp(0, 1),
                minHeight: 8,
                backgroundColor: scheme.outlineVariant.withValues(alpha: 0.3),
                color: ratio > 0.85 ? _kRed : _kIndigo,
              ),
            ),
          ],
        ),
      ),
      const SizedBox(height: 20),
      Text('Por ingresar', style: textTheme.titleMedium),
      const SizedBox(height: 8),
      ..._waiting.map((v) => Card(
          child: ListTile(
              leading: TintedIconBadge(
                  icon: Icons.directions_car,
                  color: v.prepaid ? _kGreen : _kAmber,
                  size: 40),
              title: Text(v.plate),
              subtitle: StatusChip(
                  label:
                      '${v.code} · ${v.prepaid ? 'Prepago' : 'Pago pendiente'}',
                  color: v.prepaid ? _kGreen : _kAmber),
              trailing: LoadingFilledButton(
                  label: _spaces.isEmpty
                      ? 'Sin cupos'
                      : 'Asignar ${_spaces.first}',
                  onPressed: _spaces.isEmpty
                      ? null
                      : () async {
                          await Future.delayed(
                              const Duration(milliseconds: 400));
                          if (_networkGlitch()) {
                            if (!context.mounted) return;
                            ScaffoldMessenger.of(context).showSnackBar(
                                const SnackBar(
                                    content: Text(_kConnectionError)));
                            return;
                          }
                          setState(() {
                            final space = _spaces.removeAt(0);
                            _waiting.remove(v);
                            _inside.add(_Vehicle(v.plate, v.code, v.prepaid,
                                space: space));
                          });
                        })))),
      const Divider(height: 32),
      Text('En el lote', style: textTheme.titleMedium),
      const SizedBox(height: 8),
      ..._inside.map((v) => Card(
          child: ListTile(
              leading: const TintedIconBadge(
                  icon: Icons.local_parking, color: _kIndigo, size: 40),
              title: Text('${v.plate} · ${v.space}'),
              subtitle: StatusChip(
                  label: _departed.contains(v.code)
                      ? (v.prepaid
                          ? 'Salida registrada · Prepago'
                          : 'Salida registrada · Cobro: \$15.000')
                      : 'Ingreso registrado',
                  color: _departed.contains(v.code) ? _kGreen : _kIndigo),
              trailing: _departed.contains(v.code)
                  ? null
                  : LoadingFilledButton(
                      label: 'Registrar salida',
                      onPressed: () async {
                        await Future.delayed(const Duration(milliseconds: 400));
                        if (_networkGlitch()) {
                          if (!context.mounted) return;
                          ScaffoldMessenger.of(context).showSnackBar(
                              const SnackBar(content: Text(_kConnectionError)));
                          return;
                        }
                        setState(() => _departed.add(v.code));
                      })))),
    ]);
  }
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

  Future<void> _scan() async {
    final value = await showQrScannerSheet(context, title: 'Escanear pedido');
    if (value == null || !mounted) return;
    final upper = value.toUpperCase();
    final idx = _orders
        .indexWhere((o) => upper.contains(o.split(' · ').first.toUpperCase()));
    if (idx == -1) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
          content:
              Text('Código no reconocido en la demo, mostrando un ejemplo.')));
    }
    setState(() => _selected = idx == -1 ? 0 : idx);
  }

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    final scheme = Theme.of(context).colorScheme;
    return ListView(padding: const EdgeInsets.all(16), children: [
      FilledButton.icon(
          onPressed: _scan,
          icon: const Icon(Icons.qr_code_scanner),
          label: const Text('Escanear pedido')),
      const SizedBox(height: 16),
      if (_selected == null)
        Text('Escanea el QR del cliente antes de cobrar o entregar.',
            style: textTheme.bodyMedium
                ?.copyWith(color: scheme.onSurface.withValues(alpha: 0.6)))
      else
        LiquidGlassCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text('Food Truck La Sazón', style: textTheme.titleMedium),
              const SizedBox(height: 4),
              Text(_orders[_selected!],
                  style: const TextStyle(
                      fontFamily: 'monospace',
                      letterSpacing: 0.3,
                      fontSize: 13)),
              const SizedBox(height: 14),
              Align(
                alignment: Alignment.centerLeft,
                child: StatusChip(
                    label: _delivered.contains(_selected)
                        ? 'Pedido entregado'
                        : _selected == 0
                            ? 'Pago pendiente'
                            : 'Prepago',
                    color: _delivered.contains(_selected)
                        ? _kGreen
                        : _selected == 0
                            ? _kAmber
                            : _kCyan),
              ),
              const SizedBox(height: 14),
              if (!_delivered.contains(_selected))
                LoadingFilledButton(
                    label: _selected == 0
                        ? 'Cobrar y entregar'
                        : 'Validar entrega',
                    onPressed: () async {
                      await Future.delayed(const Duration(milliseconds: 400));
                      if (_networkGlitch()) {
                        if (!context.mounted) return;
                        ScaffoldMessenger.of(context).showSnackBar(
                            const SnackBar(content: Text(_kConnectionError)));
                        return;
                      }
                      setState(() => _delivered.add(_selected!));
                    }),
              const SizedBox(height: 8),
              OutlinedButton(
                  onPressed: () => setState(() => _selected = null),
                  child: const Text('Escanear otro')),
            ],
          ),
        ),
    ]);
  }
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
  final _codes = ['HXC-STAFF-000010', 'HXC-STAFF-000021', 'HXC-STAFF-000032'];

  Future<void> _scan() async {
    final value = await showQrScannerSheet(context, title: 'Escanear personal');
    if (value == null || !mounted) return;
    final upper = value.toUpperCase();
    final idx = _codes.indexWhere((c) => upper.contains(c.toUpperCase()));
    if (idx == -1) {
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
          content:
              Text('Código no reconocido en la demo, mostrando un ejemplo.')));
    }
    setState(() {
      _selected = idx == -1 ? 0 : idx;
      _state = 0;
    });
  }

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    final scheme = Theme.of(context).colorScheme;
    return ListView(padding: const EdgeInsets.all(16), children: [
      FilledButton.icon(
          onPressed: _scan,
          icon: const Icon(Icons.qr_code_scanner),
          label: const Text('Escanear personal')),
      const SizedBox(height: 16),
      if (_selected == null)
        Text('Escanea el QR del empleado para registrar su turno.',
            style: textTheme.bodyMedium
                ?.copyWith(color: scheme.onSurface.withValues(alpha: 0.6)))
      else
        LiquidGlassCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(_people[_selected!], style: textTheme.titleMedium),
              const SizedBox(height: 4),
              Text(_codes[_selected!],
                  style: const TextStyle(
                      fontFamily: 'monospace', letterSpacing: 0.6)),
              const SizedBox(height: 14),
              Align(
                alignment: Alignment.centerLeft,
                child: StatusChip(
                  label: _state == 0
                      ? 'Pendiente de ingreso'
                      : _state == 1
                          ? 'Ingreso registrado'
                          : 'Turno completo',
                  color: _state == 0
                      ? _kAmber
                      : _state == 1
                          ? _kGreen
                          : _kIndigo,
                ),
              ),
              const SizedBox(height: 14),
              if (_state == 0)
                FilledButton(
                    onPressed: () => setState(() => _state = 1),
                    child: const Text('Registrar ingreso'))
              else if (_state == 1)
                FilledButton(
                    onPressed: () => setState(() => _state = 2),
                    child: const Text('Registrar salida')),
              const SizedBox(height: 8),
              OutlinedButton(
                  onPressed: () => setState(() {
                        _selected = null;
                        _state = 0;
                      }),
                  child: const Text('Escanear otro')),
            ],
          ),
        ),
    ]);
  }
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
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    final scheme = Theme.of(context).colorScheme;
    return ListView(padding: const EdgeInsets.all(16), children: [
      Text('Reportar incidente', style: textTheme.titleMedium),
      const SizedBox(height: 10),
      TextField(
          controller: _title,
          decoration: const InputDecoration(labelText: 'Título')),
      const SizedBox(height: 10),
      TextField(
          controller: _description,
          maxLines: 3,
          decoration: const InputDecoration(labelText: 'Descripción')),
      const SizedBox(height: 12),
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
      Text('Incidentes reportados', style: textTheme.titleMedium),
      const SizedBox(height: 8),
      ..._items.map((item) => Card(
              child: Padding(
            padding: const EdgeInsets.all(14),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const TintedIconBadge(
                    icon: Icons.report_outlined, color: _kAmber, size: 40),
                const SizedBox(width: 12),
                Expanded(
                    child: Text(item,
                        style: textTheme.bodyMedium?.copyWith(
                            color: scheme.onSurface.withValues(alpha: 0.85)))),
              ],
            ),
          ))),
    ]);
  }
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
    final textTheme = Theme.of(context).textTheme;
    final scheme = Theme.of(context).colorScheme;
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
      LiquidGlassCard(
        borderRadius: BorderRadius.circular(28),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const TintedIconBadge(
                icon: Icons.warning_amber_rounded, color: _kRed, size: 52),
            const SizedBox(height: 14),
            Text('Protocolo de emergencia', style: textTheme.titleLarge),
            const SizedBox(height: 10),
            Text('Ruta: ${info.$1}', style: textTheme.bodyMedium),
            Text('Puesto: ${info.$2}', style: textTheme.bodyMedium),
            const SizedBox(height: 8),
            Text(info.$3,
                style: textTheme.bodyMedium?.copyWith(
                    color: scheme.onSurface.withValues(alpha: 0.75))),
          ],
        ),
      ),
      const SizedBox(height: 16),
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
          style: FilledButton.styleFrom(backgroundColor: _kRed),
          child: const Text('Activar protocolo de emergencia'))
    ]);
  }
}

class _SectionCard extends StatelessWidget {
  const _SectionCard(
      {required this.title,
      required this.lines,
      required this.icon,
      this.color = _kIndigo});
  final String title;
  final List<String> lines;
  final IconData icon;
  final Color color;
  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    final scheme = Theme.of(context).colorScheme;
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(14),
        child: Row(
          children: [
            TintedIconBadge(icon: icon, color: color),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title, style: textTheme.titleSmall),
                  const SizedBox(height: 2),
                  for (final line in lines)
                    Text(line,
                        style: textTheme.bodySmall?.copyWith(
                            color: scheme.onSurface.withValues(alpha: 0.6))),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
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
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return GlassScaffold(
      appBar: const GlassAppBar(title: Text('Perfil')),
      body: ListView(
        padding: EdgeInsets.fromLTRB(24,
            kToolbarHeight + MediaQuery.of(context).padding.top + 20, 24, 16),
        children: [
          Center(
              child: CircleAvatar(
                  radius: 42,
                  backgroundColor: scheme.primary.withValues(alpha: 0.22),
                  child: Text(widget.user.name.substring(0, 1),
                      style: TextStyle(fontSize: 32, color: scheme.primary)))),
          const SizedBox(height: 14),
          OutlinedButton.icon(
              onPressed: () => ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(
                      content: Text(
                          'El selector de foto se conectará al servicio de archivos.'))),
              icon: const Icon(Icons.photo_camera_outlined),
              label: const Text('Cambiar foto')),
          const SizedBox(height: 16),
          LiquidGlassCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Material(
                    type: MaterialType.transparency,
                    child: ListTile(
                        contentPadding: EdgeInsets.zero,
                        leading: const Icon(Icons.person_outline),
                        title: const Text('Nombre'),
                        subtitle: Text(widget.user.name))),
                TextField(
                    controller: _email,
                    keyboardType: TextInputType.emailAddress,
                    decoration: const InputDecoration(labelText: 'Correo')),
                const SizedBox(height: 12),
                TextField(
                    controller: _phone,
                    keyboardType: TextInputType.phone,
                    decoration: const InputDecoration(labelText: 'Teléfono')),
                const SizedBox(height: 4),
                Material(
                    type: MaterialType.transparency,
                    child: ListTile(
                        contentPadding: EdgeInsets.zero,
                        leading: const Icon(Icons.badge_outlined),
                        title: const Text('Rol'),
                        subtitle:
                            Text(widget.user.position ?? widget.user.role))),
                const SizedBox(height: 8),
                FilledButton(
                    onPressed: () => setState(() => _saved = true),
                    child: const Text('Guardar cambios')),
                if (_saved)
                  Padding(
                      padding: const EdgeInsets.only(top: 10),
                      child: Text('Perfil guardado.',
                          style: Theme.of(context)
                              .textTheme
                              .bodySmall
                              ?.copyWith(
                                  color: scheme.onSurface
                                      .withValues(alpha: 0.6)))),
              ],
            ),
          ),
        ],
      ),
    );
  }
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
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    return GlassScaffold(
      appBar: const GlassAppBar(title: Text('Ajustes')),
      body: ListView(
        padding: EdgeInsets.fromLTRB(16,
            kToolbarHeight + MediaQuery.of(context).padding.top + 20, 16, 16),
        children: [
          Text('Preferencias', style: textTheme.titleSmall),
          const SizedBox(height: 4),
          LiquidGlassCard(
            padding: EdgeInsets.zero,
            child: Column(children: [
              SwitchListTile(
                  title: const Text('Notificaciones'),
                  value: _notifications,
                  onChanged: (value) => setState(() => _notifications = value)),
              SwitchListTile(
                  title: const Text('Modo oscuro'),
                  value: widget.dark,
                  onChanged: widget.onDarkChanged),
            ]),
          ),
          const SizedBox(height: 24),
          Text('Seguridad', style: textTheme.titleSmall),
          const SizedBox(height: 4),
          Card(
            child: ListTile(
                leading: const Icon(Icons.lock_outline),
                title: const Text('Cambiar contraseña'),
                trailing: const Icon(Icons.chevron_right),
                onTap: () => Navigator.of(context).push(MaterialPageRoute(
                    builder: (_) => const ChangePasswordPage()))),
          ),
          const SizedBox(height: 24),
          Text('Soporte', style: textTheme.titleSmall),
          const SizedBox(height: 4),
          const Card(
            child: ListTile(
                leading: Icon(Icons.help_outline),
                title: Text('Ayuda'),
                subtitle: Text(
                    'Comunícate con soporte de HEXACORE para resolver tus dudas.')),
          ),
          const SizedBox(height: 24),
          Text('Acerca de', style: textTheme.titleSmall),
          const SizedBox(height: 4),
          const Card(
              child: ListTile(
                  title: Text('HEXACORE'),
                  subtitle: Text('Versión 0.1.0 · Equipo HEXACORE'))),
          const SizedBox(height: 20),
          OutlinedButton.icon(
              onPressed: widget.onLogout,
              icon: const Icon(Icons.logout),
              label: const Text('Cerrar sesión')),
        ],
      ),
    );
  }
}
