import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Usuario } from './usuario.entity';

/** Para qué sirve el enlace. */
export enum TipoToken {
  /** Confirmar el correo — pasos 5-7 del CU-027. */
  VERIFICACION = 'VERIFICACION',
  /** Restablecer la contraseña — CU-027A. */
  RECUPERACION = 'RECUPERACION',
}

/**
 * Los enlaces de un solo uso que se envían por correo.
 *
 * **Esta tabla no está en el SAD §12.** Hace falta para el paso 5 (*"envía un
 * correo de verificación"*) y para CU-027A (*"enlace de recuperación de un solo
 * uso con expiración"*).
 *
 * ## Se guarda el hash del token, no el token
 *
 * Igual que con las contraseñas, y por el mismo motivo. Un enlace de
 * recuperación **da acceso a la cuenta**: si se guardara en claro, cualquiera
 * con acceso de lectura a la base podría tomar los enlaces pendientes y entrar
 * en esas cuentas sin dejar rastro de intrusión.
 *
 * Guardando solo el hash, la base no sirve para suplantar a nadie: el valor que
 * viaja en el correo existe una sola vez, en ese correo.
 */
@Entity({ name: 'tokens_cuenta' })
@Index('idx_tokens_usuario', ['usuarioId', 'tipo'])
// Se busca por hash al abrir el enlace: es el único dato que llega de vuelta.
@Index('idx_tokens_hash', ['hashToken'], { unique: true })
export class TokenCuenta {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'usuario_id', type: 'uuid' })
  usuarioId: string;

  @ManyToOne(() => Usuario, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'usuario_id' })
  usuario: Usuario;

  @Column({ name: 'tipo', type: 'enum', enum: TipoToken, enumName: 'tipo_token' })
  tipo: TipoToken;

  /** SHA-256 del token que viajó en el correo. Nunca el token. */
  @Column({ name: 'hash_token', type: 'varchar', length: 64 })
  hashToken: string;

  @Column({ name: 'expira_en', type: 'timestamptz' })
  expiraEn: Date;

  /**
   * Cuándo se usó. Nulo mientras siga disponible.
   *
   * Es lo que hace el enlace **de un solo uso**, como exige CU-027A: al
   * canjearlo se marca, y un segundo intento con el mismo enlace se rechaza
   * aunque no haya expirado todavía.
   */
  @Column({ name: 'usado_en', type: 'timestamptz', nullable: true })
  usadoEn: Date | null;

  @CreateDateColumn({ name: 'creado_en', type: 'timestamptz' })
  creadoEn: Date;
}
