import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

/**
 * Los cuatro roles del sistema.
 *
 * **Nota de terminología:** la ficha del CU-027 lista los actores como
 * *"Cliente, Empleado, Organizador, Administrador"*, pero el resto del proyecto
 * —ADR-07, la vista de contenedores del SAD §8, la app móvil y el portal web—
 * llama **Personal** a lo que ahí aparece como "Empleado". Se usa `Personal`
 * porque es el término que ya está en el código de los tres frontends; cambiarlo
 * rompería el login de la app sin ganar nada.
 */
export enum NombreRol {
  CLIENTE = 'Cliente',
  PERSONAL = 'Personal',
  ORGANIZADOR = 'Organizador',
  ADMINISTRADOR = 'Administrador',
}

/**
 * Rol del sistema (SAD §12: `Rol(id, nombre)`).
 *
 * El paso 4 del CU-027 exige crear las cuentas *"con el rol correspondiente
 * ('Cliente' por defecto)"*, así que los roles tienen que existir antes de que
 * nadie se registre: los siembra la migración, no la semilla de desarrollo.
 * Una base recién migrada sin roles dejaría el registro inutilizable.
 */
@Entity({ name: 'roles' })
export class Rol {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'nombre', type: 'varchar', length: 40, unique: true })
  nombre: string;

  @Column({ name: 'descripcion', type: 'varchar', length: 200 })
  descripcion: string;

  /**
   * Si el rol lo creó el sistema y no puede borrarse.
   *
   * CU-028 permite al administrador crear y eliminar roles, pero los cuatro de
   * base sostienen el funcionamiento del sistema: sin `Cliente` el registro no
   * puede asignar el rol por defecto que pide el paso 4.
   */
  @Column({ name: 'del_sistema', type: 'boolean', default: false })
  delSistema: boolean;

  @CreateDateColumn({ name: 'creado_en', type: 'timestamptz' })
  creadoEn: Date;
}
