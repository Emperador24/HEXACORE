import 'dart:ui';

import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

import '../widgets/liquid_glass.dart';

class _OnboardingSlide {
  const _OnboardingSlide(
      {required this.icon, required this.title, required this.description});
  final IconData icon;
  final String title;
  final String description;
}

const _slides = [
  _OnboardingSlide(
    icon: Icons.confirmation_number_outlined,
    title: 'Compra y revende tus entradas',
    description:
        'Consigue boletas para tus eventos favoritos y revéndelas si ya no puedes ir.',
  ),
  _OnboardingSlide(
    icon: Icons.local_parking_outlined,
    title: 'Controla todo desde un solo lugar',
    description:
        'Parqueadero, pedidos de comida y el estado de tus solicitudes, todo en la app.',
  ),
  _OnboardingSlide(
    icon: Icons.notifications_active_outlined,
    title: 'Mantente informado',
    description:
        'Recibe notificaciones de cambios de turno, incidentes y alertas en tiempo real.',
  ),
];

// bienvenida de 3 pasos, se muestra solo la primera vez
class OnboardingPage extends StatefulWidget {
  const OnboardingPage({super.key, required this.onDone});
  final VoidCallback onDone;

  @override
  State<OnboardingPage> createState() => _OnboardingPageState();
}

class _OnboardingPageState extends State<OnboardingPage> {
  final _controller = PageController();
  int _page = 0;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  bool get _isLast => _page == _slides.length - 1;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final isDark = scheme.brightness == Brightness.dark;
    return Scaffold(
      body: Stack(
        children: [
          const AtmosphereBackground(),
          SafeArea(
            child: Column(
              children: [
                SizedBox(
                  height: 48,
                  child: Align(
                    alignment: Alignment.centerRight,
                    child: _isLast
                        ? null
                        : Padding(
                            padding: const EdgeInsets.only(right: 8),
                            child: TextButton(
                              onPressed: widget.onDone,
                              child: Text('Omitir',
                                  style: TextStyle(
                                      color: scheme.onSurface
                                          .withValues(alpha: 0.7),
                                      fontWeight: FontWeight.w600)),
                            ),
                          ),
                  ),
                ),
                Expanded(
                  child: PageView.builder(
                    controller: _controller,
                    itemCount: _slides.length,
                    onPageChanged: (i) => setState(() => _page = i),
                    itemBuilder: (context, i) {
                      final slide = _slides[i];
                      return Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 32),
                        child: Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            ClipOval(
                              child: BackdropFilter(
                                filter:
                                    ImageFilter.blur(sigmaX: 24, sigmaY: 24),
                                child: Container(
                                  width: 180,
                                  height: 180,
                                  alignment: Alignment.center,
                                  decoration: BoxDecoration(
                                    shape: BoxShape.circle,
                                    color: Colors.white
                                        .withValues(alpha: isDark ? 0.10 : 0.5),
                                    border: Border.all(
                                        color: Colors.white.withValues(
                                            alpha: isDark ? 0.25 : 0.7)),
                                  ),
                                  child: Icon(slide.icon,
                                      size: 84, color: scheme.primary),
                                ),
                              ),
                            ),
                            const SizedBox(height: 40),
                            Text(
                              slide.title,
                              textAlign: TextAlign.center,
                              style: GoogleFonts.spaceGrotesk(
                                fontSize: 26,
                                fontWeight: FontWeight.w700,
                                letterSpacing: -0.3,
                                color: scheme.onSurface,
                              ),
                            ),
                            const SizedBox(height: 14),
                            Text(
                              slide.description,
                              textAlign: TextAlign.center,
                              style: GoogleFonts.manrope(
                                fontSize: 15,
                                height: 1.4,
                                color: scheme.onSurface.withValues(alpha: 0.7),
                              ),
                            ),
                          ],
                        ),
                      );
                    },
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.symmetric(vertical: 20),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      for (var i = 0; i < _slides.length; i++)
                        AnimatedContainer(
                          duration: const Duration(milliseconds: 220),
                          margin: const EdgeInsets.symmetric(horizontal: 4),
                          width: i == _page ? 22 : 8,
                          height: 8,
                          decoration: BoxDecoration(
                            borderRadius: BorderRadius.circular(4),
                            color: i == _page
                                ? scheme.primary
                                : scheme.onSurface.withValues(alpha: 0.25),
                          ),
                        ),
                    ],
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.fromLTRB(24, 0, 24, 24),
                  child: SizedBox(
                    width: double.infinity,
                    child: _isLast
                        ? FilledButton(
                            onPressed: widget.onDone,
                            child: const Text('Comenzar'),
                          )
                        : const SizedBox(height: 48),
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
