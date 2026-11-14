import { Component, ChangeDetectionStrategy } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { MatTabsModule } from '@angular/material/tabs';

/** CU-007 (fichas y asignación), CU-008 (cambios de turno) y CU-009 (asistencia). */
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
      <a mat-tab-link routerLink="/admin/personal/cambios" routerLinkActive #c="routerLinkActive" [active]="c.isActive">Cambios de turno</a>
      <a mat-tab-link routerLink="/admin/personal/asistencia" routerLinkActive #d="routerLinkActive" [active]="d.isActive">Asistencia</a>
    </nav>
    <mat-tab-nav-panel #panel />
  `,
  changeDetection: ChangeDetectionStrategy.Eager,
  styles: `.pestanas { margin-bottom: 16px; border-bottom: 1px solid var(--hx-borde); }`
})
export class PestanasPersonalComponent {}
