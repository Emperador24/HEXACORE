// Top-level build file: declara los plugins usados por los módulos sin aplicarlos aquí.
// Desde AGP 9.0, el soporte de Kotlin viene incorporado en com.android.application/library
// (built-in Kotlin) — ya no se aplica org.jetbrains.kotlin.android por separado.
// https://developer.android.com/build/releases/agp-9-0-0-release-notes#android-gradle-plugin-built-in-kotlin
plugins {
    id("com.android.application") version "9.3.2" apply false
    // El compilador de Compose sigue siendo un plugin aparte (no lo cubre el
    // Kotlin incorporado en AGP 9) — su versión debe alinearse con el KGP que
    // AGP 9.3 trae internamente (2.2.10).
    id("org.jetbrains.kotlin.plugin.compose") version "2.2.10" apply false
}
