import { Component, inject, OnInit } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { EventosService } from '../core/eventos.service';
import { EstadoEvento } from '../core/models';

/** Crear o editar un evento — misma pantalla para las dos acciones de CU-026. */
@Component({
  selector: 'app-evento-formulario',
  standalone: true,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatSelectModule,
    MatButtonModule
  ],
  templateUrl: './evento-formulario.component.html',
  styleUrl: './evento-formulario.component.scss'
})
export class EventoFormularioComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly eventosService = inject(EventosService);

  private idEnEdicion: string | null = null;
  readonly estados = Object.values(EstadoEvento);

  readonly formulario = this.fb.nonNullable.group({
    nombre: ['', Validators.required],
    fecha: ['', Validators.required],
    recinto: ['', Validators.required],
    aforo: [0, [Validators.required, Validators.min(1)]],
    estado: [EstadoEvento.PLANIFICACION, Validators.required]
  });

  get esEdicion(): boolean {
    return this.idEnEdicion !== null;
  }

  ngOnInit(): void {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) return;

    const evento = this.eventosService.obtenerPorId(id);
    if (!evento) {
      this.router.navigateByUrl('/admin/eventos');
      return;
    }

    this.idEnEdicion = id;
    this.formulario.patchValue(evento);
  }

  guardar(): void {
    if (this.formulario.invalid) return;
    const datos = this.formulario.getRawValue();

    if (this.esEdicion) {
      this.eventosService.actualizar(this.idEnEdicion!, datos);
    } else {
      this.eventosService.crear(datos);
    }
    this.router.navigateByUrl('/admin/eventos');
  }
}
