// Desde AGP 9.0 el soporte de Kotlin y el compilador de Compose vienen incorporados
// en el plugin de Android — no se aplican org.jetbrains.kotlin.android ni
// org.jetbrains.kotlin.plugin.compose por separado.
plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.plugin.compose")
}

android {
    namespace = "com.hexacore.cliente"
    compileSdk = 37

    defaultConfig {
        applicationId = "com.hexacore.cliente"
        minSdk = 26
        targetSdk = 37
        versionCode = 1
        versionName = "0.1.0"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlin {
        jvmToolchain(17)
    }

    buildFeatures {
        compose = true
        buildConfig = true // habilita BuildConfig.VERSION_NAME (pantalla de Ajustes)
    }
}

// Coil 3.6.0 se publica con un kotlin-stdlib más nuevo (metadata 2.4.0) que el
// compilador de Kotlin que trae AGP 9.3.2 (lee metadata hasta 2.3.0) puede
// leer. El stdlib es compatible en tiempo de ejecución, así que se fuerza a
// la versión que sí trae el proyecto para evitar el error de compilación.
configurations.all {
    resolutionStrategy {
        force("org.jetbrains.kotlin:kotlin-stdlib:2.2.10")
        force("org.jetbrains.kotlin:kotlin-stdlib-common:2.2.10")
    }
}

dependencies {
    implementation(platform("androidx.compose:compose-bom:2026.08.00"))
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-graphics")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.compose.material3:material3")
    // Íconos base (Home, List, LocationOn, ShoppingCart) para la barra de navegación.
    implementation("androidx.compose.material:material-icons-core")
    implementation("androidx.activity:activity-compose:1.10.1")
    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.9.0")
    // Navegación entre las secciones básicas del cliente (Inicio, Entradas, Parqueadero, Pedidos).
    implementation("androidx.navigation:navigation-compose:2.9.0")
    // Carga del poster del evento (subido por el Administrador al crearlo en el
    // Portal Web y servido como URL por el API Gateway) — ver Evento.imagenUrl.
    implementation("io.coil-kt.coil3:coil-compose:3.6.0")
    implementation("io.coil-kt.coil3:coil-network-okhttp:3.6.0")

    debugImplementation("androidx.compose.ui:ui-tooling")
    debugImplementation("androidx.compose.ui:ui-test-manifest")

    testImplementation("junit:junit:4.13.2")
    androidTestImplementation(platform("androidx.compose:compose-bom:2026.08.00"))
    androidTestImplementation("androidx.test.ext:junit:1.2.1")
    androidTestImplementation("androidx.test.espresso:espresso-core:3.6.1")
    androidTestImplementation("androidx.compose.ui:ui-test-junit4")
}
