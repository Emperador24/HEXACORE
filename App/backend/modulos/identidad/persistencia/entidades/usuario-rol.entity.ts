import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { Rol } from './rol.entity';
import { Usuario } from './usuario.entity';

/**
 * Asignación de un rol a un usuario (SAD §12: `UsuarioRol(usuario_id, rol_id)`).
 *
 * Es una tabla propia y no una columna `rol_id` en `usuarios` porque el CU-028
 * habla de *"usuarios a asignar"* en plural y de reasignar usuarios al eliminar
 * un rol: una persona puede ser a la vez Personal y Administrador, y con una
 * columna eso no cabe.
 *
 * La clave primaria compuesta es lo que impide asignar dos veces el mismo rol
 * a la misma persona — sin ella, un doble clic dejaría filas duplicadas y
 * contar "usuarios con este rol" daría de más.
 */
@Entity({ name: 'usuarios_roles' })
@Index('idx_usuarios_roles_rol', ['rolId'])
export class UsuarioRol {
  @PrimaryColumn({ name: 'usuario_id', type: 'uuid' })
  usuarioId: string;

  @PrimaryColumn({ name: 'rol_id', type: 'uuid' })
  rolId: string;

  /** Si se borra la cuenta, sus asignaciones se van con ella. */
  @ManyToOne(() => Usuario, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'usuario_id' })
  usuario: Usuario;

  /**
   * `RESTRICT` a propósito: borrar un rol que alguien tiene asignado debe
   * fallar. Es lo que exige **CU-028A** — *"si el administrador intenta
   * eliminar un rol con usuarios activos asignados, el sistema exige
   * reasignarlos primero"*. Con `CASCADE`, esos usuarios se quedarían sin
   * ningún rol y sin que nadie se enterara.
   */
  @ManyToOne(() => Rol, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({ name: 'rol_id' })
  rol: Rol;

  /**
   * Quién asignó el rol. Parte de la trazabilidad que pide CU-028.
   *
   * Columna normal, NO parte de la clave: si formara parte, dos
   * administradores distintos podrían asignar el mismo rol a la misma persona
   * y quedarían dos filas, que es justo lo que la clave compuesta evita.
   */
  @Column({ name: 'asignado_por', type: 'uuid', nullable: true })
  asignadoPor: string | null;

  @CreateDateColumn({ name: 'asignado_en', type: 'timestamptz' })
  asignadoEn: Date;
}
