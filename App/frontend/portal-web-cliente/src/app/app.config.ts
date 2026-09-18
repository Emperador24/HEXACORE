import { ApplicationConfig, inject, provideAppInitializer, provideZoneChangeDetection } from '@angular/core';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';

import { routes } from './app.routes';
import { AuthService } from './core/auth.service';
import { TemaService } from './core/tema.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes, withComponentInputBinding()),
    provideAnimationsAsync(),
    provideHttpClient(withFetch()),
    // Antes de mostrar nada: aplicar el tema guardado (sin parpadeo) y
    // recuperar la sesión con la cookie, para que los guards ya la vean.
    provideAppInitializer(() => {
      inject(TemaService);
      return inject(AuthService).restaurar();
    })
  ]
};
