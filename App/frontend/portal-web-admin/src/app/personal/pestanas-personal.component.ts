import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { MatTabsModule } from '@angular/material/tabs';

/** Las dos mitades del CU-007: gestionar fichas y asignarlas a eventos. */
@Component({
  selector: 'app-pestanas-personal',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, MatTabsModule],
  template: `
    <nav mat-tab-nav-bar [tabPanel]="panel" class="pestanas">
      <a mat-tab-link routerLink="/admin/personal" routerLinkActive #a="routerLinkActive"
         [routerLinkActiveOptions]="{ exact: true }" [active]="a.isActive">Empleados</a>
      <a mat-tab-link routerLink="/admin/personal/asignaciones" routerLinkActive #b="routerLinkActive" [active]="b.isActive">
        Asignación a eventos
      </a>
    </nav>
    <mat-tab-nav-panel #panel />
  `,
  styles: `.pestanas { margin-bottom: 16px; border-bottom: 1px solid var(--hx-borde); }`
})
export class PestanasPersonalComponent {}
