import 'dart:ui';

import 'package:flutter/material.dart';

// fondo con manchas de color difuminadas
class AtmosphereBackground extends StatelessWidget {
  const AtmosphereBackground({super.key});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final base = isDark ? const Color(0xFF0B0F1A) : const Color(0xFFF5F5F7);
    final blobs = isDark
        ? const [
            _BlobSpec(Color(0xFFFF3D7F), 0.50),
            _BlobSpec(Color(0xFF22D3EE), 0.36),
            _BlobSpec(Color(0xFF3B5BFF), 0.46),
            _BlobSpec(Color(0xFFFFB020), 0.26),
          ]
        : const [
            _BlobSpec(Color(0xFFFF5C96), 0.55),
            _BlobSpec(Color(0xFF2FD1EC), 0.46),
            _BlobSpec(Color(0xFF5C7FFF), 0.55),
            _BlobSpec(Color(0xFFFFAA33), 0.40),
          ];
    return Positioned.fill(
      child: ColoredBox(
        color: base,
        child: Stack(children: [
          Positioned(
              left: -120, top: -80, child: _Blob(spec: blobs[0], size: 340)),
          Positioned(
              right: -100, top: 60, child: _Blob(spec: blobs[1], size: 300)),
          Positioned(
              left: -60, bottom: -140, child: _Blob(spec: blobs[2], size: 360)),
          Positioned(
              right: -80, bottom: 140, child: _Blob(spec: blobs[3], size: 260)),
        ]),
      ),
    );
  }
}

class _BlobSpec {
  const _BlobSpec(this.color, this.opacity);
  final Color color;
  final double opacity;
}

class _Blob extends StatelessWidget {
  const _Blob({required this.spec, required this.size});
  final _BlobSpec spec;
  final double size;

  @override
  Widget build(BuildContext context) => ImageFiltered(
        imageFilter: ImageFilter.blur(sigmaX: 70, sigmaY: 70),
        child: Container(
          width: size,
          height: size,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            color: spec.color.withValues(alpha: spec.opacity),
          ),
        ),
      );
}

// scaffold con el fondo difuminado detrás, usar en vez de Scaffold normal
class GlassScaffold extends StatelessWidget {
  const GlassScaffold({
    super.key,
    this.appBar,
    this.drawer,
    required this.body,
    this.bottomNavigationBar,
    this.extendBody = true,
    this.extendBodyBehindAppBar = true,
  });

  final PreferredSizeWidget? appBar;
  final Widget? drawer;
  final Widget body;
  final Widget? bottomNavigationBar;
  final bool extendBody;
  final bool extendBodyBehindAppBar;

  @override
  Widget build(BuildContext context) => Stack(children: [
        const AtmosphereBackground(),
        Scaffold(
          backgroundColor: Colors.transparent,
          extendBody: extendBody,
          extendBodyBehindAppBar: extendBodyBehindAppBar,
          appBar: appBar,
          drawer: drawer,
          body: body,
          bottomNavigationBar: bottomNavigationBar,
        ),
      ]);
}

// tarjeta con efecto de vidrio (blur real), para las cosas importantes
class LiquidGlassCard extends StatelessWidget {
  const LiquidGlassCard({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.all(20),
    this.borderRadius,
  });

  final Widget child;
  final EdgeInsetsGeometry padding;
  final BorderRadius? borderRadius;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final isDark = scheme.brightness == Brightness.dark;
    final radius = borderRadius ?? BorderRadius.circular(28);
    return ClipRRect(
      borderRadius: radius,
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: 24, sigmaY: 24),
        child: Container(
          padding: padding,
          decoration: BoxDecoration(
            borderRadius: radius,
            color: scheme.surface.withValues(alpha: isDark ? 0.45 : 0.48),
            border: Border.all(
              color: isDark
                  ? Colors.white.withValues(alpha: 0.10)
                  : Colors.white.withValues(alpha: 0.65),
            ),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withValues(alpha: isDark ? 0.35 : 0.10),
                blurRadius: 30,
                offset: const Offset(0, 12),
              ),
            ],
          ),
          child: child,
        ),
      ),
    );
  }
}

// appbar transparente con blur, pone botón de volver si se puede hacer pop
class GlassAppBar extends StatelessWidget implements PreferredSizeWidget {
  const GlassAppBar({super.key, required this.title, this.actions});

  final Widget title;
  final List<Widget>? actions;

  @override
  Size get preferredSize => const Size.fromHeight(kToolbarHeight);

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final isDark = scheme.brightness == Brightness.dark;
    final canPop = Navigator.canPop(context);
    return ClipRect(
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: 24, sigmaY: 24),
        child: Container(
          decoration: BoxDecoration(
            color: scheme.surface.withValues(alpha: isDark ? 0.55 : 0.55),
            border: Border(
              bottom: BorderSide(
                color: scheme.outlineVariant
                    .withValues(alpha: isDark ? 0.25 : 0.4),
              ),
            ),
          ),
          child: AppBar(
            title: title,
            actions: actions,
            backgroundColor: Colors.transparent,
            elevation: 0,
            scrolledUnderElevation: 0,
            leading: canPop
                ? Padding(
                    padding: const EdgeInsets.all(8),
                    child: _GlassCircleButton(
                      icon: Icons.chevron_left,
                      onTap: () => Navigator.of(context).pop(),
                    ),
                  )
                : null,
          ),
        ),
      ),
    );
  }
}

class _GlassCircleButton extends StatelessWidget {
  const _GlassCircleButton({required this.icon, required this.onTap});
  final IconData icon;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final isDark = scheme.brightness == Brightness.dark;
    return InkResponse(
      onTap: onTap,
      radius: 24,
      child: Container(
        width: 38,
        height: 38,
        decoration: BoxDecoration(
          shape: BoxShape.circle,
          color: Colors.white.withValues(alpha: isDark ? 0.12 : 0.5),
          border: Border.all(
              color: Colors.white.withValues(alpha: isDark ? 0.3 : 0.7)),
        ),
        child: Icon(icon, color: scheme.onSurface, size: 22),
      ),
    );
  }
}

// campana de notificaciones con contador de no leídas
class NotificationBellButton extends StatelessWidget {
  const NotificationBellButton(
      {super.key, required this.unreadCount, required this.onTap});

  final int unreadCount;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(right: 8),
        child: Stack(
          clipBehavior: Clip.none,
          children: [
            _GlassCircleButton(
                icon: Icons.notifications_outlined, onTap: onTap),
            if (unreadCount > 0)
              Positioned(
                right: -2,
                top: -2,
                child: Container(
                  width: 16,
                  height: 16,
                  alignment: Alignment.center,
                  decoration: const BoxDecoration(
                      color: Color(0xFFFF5A5F), shape: BoxShape.circle),
                  child: Text(
                    unreadCount > 9 ? '9+' : '$unreadCount',
                    style: const TextStyle(
                        color: Colors.white,
                        fontSize: 9,
                        fontWeight: FontWeight.w700),
                  ),
                ),
              ),
          ],
        ),
      );
}

// barra de navegación flotante, resalta el ítem seleccionado con un fondo tintado
class GlassNavigationBar extends StatelessWidget {
  const GlassNavigationBar({
    super.key,
    required this.selectedIndex,
    required this.onDestinationSelected,
    required this.destinations,
  });

  final int selectedIndex;
  final ValueChanged<int> onDestinationSelected;
  final List<NavigationDestination> destinations;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final isDark = scheme.brightness == Brightness.dark;
    final bottomInset = MediaQuery.of(context).padding.bottom;
    return Padding(
      padding: EdgeInsets.fromLTRB(16, 0, 16, bottomInset > 0 ? 8 : 12),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(28),
        child: BackdropFilter(
          filter: ImageFilter.blur(sigmaX: 28, sigmaY: 28),
          child: DecoratedBox(
            decoration: BoxDecoration(
              color: scheme.surface.withValues(alpha: isDark ? 0.55 : 0.55),
              borderRadius: BorderRadius.circular(28),
              border: Border.all(
                color: isDark
                    ? Colors.white.withValues(alpha: 0.08)
                    : Colors.white.withValues(alpha: 0.55),
              ),
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withValues(alpha: isDark ? 0.4 : 0.14),
                  blurRadius: 24,
                  offset: const Offset(0, 8),
                ),
              ],
            ),
            child: SizedBox(
              height: 68,
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceAround,
                children: [
                  for (var i = 0; i < destinations.length; i++)
                    _NavItem(
                      destination: destinations[i],
                      selected: i == selectedIndex,
                      onTap: () => onDestinationSelected(i),
                    ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _NavItem extends StatelessWidget {
  const _NavItem(
      {required this.destination, required this.selected, required this.onTap});
  final NavigationDestination destination;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final color =
        selected ? scheme.primary : scheme.onSurface.withValues(alpha: 0.55);
    return InkWell(
      borderRadius: BorderRadius.circular(18),
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 2),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            AnimatedContainer(
              duration: const Duration(milliseconds: 220),
              curve: Curves.easeOutCubic,
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
              decoration: BoxDecoration(
                color: selected
                    ? scheme.primary.withValues(alpha: 0.18)
                    : Colors.transparent,
                borderRadius: BorderRadius.circular(14),
              ),
              child: IconTheme(
                data: IconThemeData(color: color, size: 20),
                child: selected && destination.selectedIcon != null
                    ? destination.selectedIcon!
                    : destination.icon,
              ),
            ),
            const SizedBox(height: 4),
            Text(destination.label,
                style: TextStyle(
                    fontSize: 10.5, fontWeight: FontWeight.w700, color: color)),
          ],
        ),
      ),
    );
  }
}

// animación al cambiar de pestaña (fade + desliza un poco)
class GlassTabSwitcher extends StatelessWidget {
  const GlassTabSwitcher(
      {super.key, required this.tabIndex, required this.child});

  final int tabIndex;
  final Widget child;

  @override
  Widget build(BuildContext context) => AnimatedSwitcher(
        duration: const Duration(milliseconds: 260),
        switchInCurve: Curves.easeOutCubic,
        switchOutCurve: Curves.easeInCubic,
        transitionBuilder: (child, animation) => FadeTransition(
          opacity: animation,
          child: SlideTransition(
            position:
                Tween<Offset>(begin: const Offset(0, 0.02), end: Offset.zero)
                    .animate(animation),
            child: child,
          ),
        ),
        child: KeyedSubtree(key: ValueKey(tabIndex), child: child),
      );
}

// insignia con fondo y borde del mismo color, bien tenue
class TintedBadge extends StatelessWidget {
  const TintedBadge({
    super.key,
    required this.color,
    required this.child,
    this.padding = const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
    this.radius = 999,
  });

  final Color color;
  final Widget child;
  final EdgeInsetsGeometry padding;
  final double radius;

  // brightness por defecto oscuro si no se pasa el del tema actual
  static Color foreground(Color color,
          [Brightness brightness = Brightness.dark]) =>
      brightness == Brightness.dark
          ? Color.lerp(color, Colors.white, 0.35)!
          : Color.lerp(color, Colors.black, 0.35)!;

  @override
  Widget build(BuildContext context) {
    final fg = foreground(color, Theme.of(context).brightness);
    return Container(
      padding: padding,
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.16),
        border: Border.all(color: color.withValues(alpha: 0.4)),
        borderRadius: BorderRadius.circular(radius),
      ),
      child: DefaultTextStyle(
        style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: fg),
        child: IconTheme(
          data: IconThemeData(color: fg, size: 16),
          child: child,
        ),
      ),
    );
  }
}

// insignia cuadrada con ícono de categoría en el centro
class TintedIconBadge extends StatelessWidget {
  const TintedIconBadge(
      {super.key, required this.icon, required this.color, this.size = 46});

  final IconData icon;
  final Color color;
  final double size;

  @override
  Widget build(BuildContext context) => Container(
        width: size,
        height: size,
        decoration: BoxDecoration(
          color: color.withValues(alpha: 0.18),
          border: Border.all(color: color.withValues(alpha: 0.35)),
          borderRadius: BorderRadius.circular(size * 0.3),
        ),
        child: Icon(icon,
            color: TintedBadge.foreground(color, Theme.of(context).brightness),
            size: size * 0.46),
      );
}

// insignia con día y mes apilados, para fechas de evento
class TintedDateBadge extends StatelessWidget {
  const TintedDateBadge(
      {super.key, required this.day, required this.month, required this.color});

  final String day;
  final String month;
  final Color color;

  @override
  Widget build(BuildContext context) => Container(
        width: 46,
        height: 46,
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: color.withValues(alpha: 0.18),
          border: Border.all(color: color.withValues(alpha: 0.35)),
          borderRadius: BorderRadius.circular(14),
        ),
        child: Text('$day\n$month',
            textAlign: TextAlign.center,
            style: TextStyle(
                fontFamily: 'Space Grotesk',
                fontSize: 11,
                height: 1.15,
                fontWeight: FontWeight.w700,
                color: TintedBadge.foreground(
                    color, Theme.of(context).brightness))),
      );
}

// chip de estado (validado, pendiente, etc)
class StatusChip extends StatelessWidget {
  const StatusChip(
      {super.key, required this.label, required this.color, this.icon});

  final String label;
  final Color color;
  final IconData? icon;

  @override
  Widget build(BuildContext context) => TintedBadge(
        color: color,
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
        child: Row(mainAxisSize: MainAxisSize.min, children: [
          if (icon != null) ...[Icon(icon, size: 15), const SizedBox(width: 6)],
          Text(label),
        ]),
      );
}

// línea punteada, como el talón de un boleto
class DashedDivider extends StatelessWidget {
  const DashedDivider({super.key, this.color});
  final Color? color;

  @override
  Widget build(BuildContext context) {
    final c = color ??
        Theme.of(context).colorScheme.onSurface.withValues(alpha: 0.24);
    const dash = 6.0, gap = 5.0;
    return SizedBox(
      height: 1,
      child: LayoutBuilder(builder: (context, constraints) {
        final count = (constraints.maxWidth / (dash + gap)).floor();
        return Row(
          children: [
            for (var i = 0; i < count; i++)
              Padding(
                padding: const EdgeInsets.only(right: gap),
                child: Container(width: dash, height: 1, color: c),
              ),
          ],
        );
      }),
    );
  }
}

// medidor de fuerza de contraseña, se actualiza mientras se escribe
class PasswordStrengthMeter extends StatelessWidget {
  const PasswordStrengthMeter({super.key, required this.password});
  final String password;

  static int score(String password) {
    var s = 0;
    if (password.length >= 8) s++;
    if (RegExp(r'[A-Z]').hasMatch(password)) s++;
    if (RegExp(r'[0-9]').hasMatch(password)) s++;
    if (RegExp(r'[^A-Za-z0-9]').hasMatch(password)) s++;
    return s;
  }

  @override
  Widget build(BuildContext context) {
    if (password.isEmpty) return const SizedBox.shrink();
    final s = score(password);
    final Color color;
    final String label;
    if (s <= 1) {
      color = const Color(0xFFFF5A5F);
      label = 'Débil';
    } else if (s <= 3) {
      color = const Color(0xFFFFB020);
      label = 'Media';
    } else {
      color = const Color(0xFF34C759);
      label = 'Fuerte';
    }
    return Padding(
      padding: const EdgeInsets.only(top: 8),
      child: Row(
        children: [
          Expanded(
            child: Row(
              children: [
                for (var i = 0; i < 4; i++)
                  Expanded(
                    child: Padding(
                      padding: EdgeInsets.only(right: i < 3 ? 4 : 0),
                      child: AnimatedContainer(
                        duration: const Duration(milliseconds: 200),
                        height: 4,
                        decoration: BoxDecoration(
                          color: i < s
                              ? color
                              : Theme.of(context)
                                  .colorScheme
                                  .outlineVariant
                                  .withValues(alpha: 0.4),
                          borderRadius: BorderRadius.circular(2),
                        ),
                      ),
                    ),
                  ),
              ],
            ),
          ),
          const SizedBox(width: 10),
          Text(label,
              style: TextStyle(
                  fontSize: 12, fontWeight: FontWeight.w700, color: color)),
        ],
      ),
    );
  }
}

// botón que se deshabilita y muestra un spinner mientras espera onPressed
class LoadingFilledButton extends StatefulWidget {
  const LoadingFilledButton(
      {super.key, required this.label, required this.onPressed, this.icon});

  final String label;
  final Future<void> Function()? onPressed;
  final IconData? icon;

  @override
  State<LoadingFilledButton> createState() => _LoadingFilledButtonState();
}

class _LoadingFilledButtonState extends State<LoadingFilledButton> {
  bool _loading = false;

  Future<void> _handleTap() async {
    if (widget.onPressed == null || _loading) return;
    setState(() => _loading = true);
    try {
      await widget.onPressed!();
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final Widget child = _loading
        ? SizedBox(
            width: 18,
            height: 18,
            child: CircularProgressIndicator(
                strokeWidth: 2.4, color: scheme.onPrimary))
        : widget.icon == null
            ? Text(widget.label)
            : Row(mainAxisSize: MainAxisSize.min, children: [
                Icon(widget.icon, size: 18),
                const SizedBox(width: 8),
                Text(widget.label),
              ]);
    return FilledButton(
      onPressed: widget.onPressed == null || _loading ? null : _handleTap,
      child: child,
    );
  }
}
