import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Usuario } from './usuario.entity';

/**
 * Un inicio de sesión.
 *
 * **Esta tabla no está en el SAD §12**, y sin ella el paso 9 del CU-027 no se
 * puede cumplir: dice *"valida las credenciales, genera un token de sesión y
 * **registra el inicio de sesión**"*. Registrarlo en algún sitio es el
 * requisito; este es el sitio.
 *
 * ## Lo que NO se guarda: el token
 *
 * Se guarda su **identificador** (`jti`), no el token. Un token de sesión es
 * una credencial viva: quien la tenga es esa persona. Guardarlo en la base
 * significaría que leer esta tabla equivale a poder suplantar a cualquiera que
 * tenga la sesión abierta.
 *
 * Con el `jti` basta para lo que hace falta: saber que la sesión existe,
 * cuándo caduca, y poder revocarla.
 */
@Entity({ name: 'sesiones' })
@Index('idx_sesiones_usuario', ['usuarioId'])
// El identificador del token se busca en cada petición para comprobar que la
// sesión no fue revocada.
@Index('idx_sesiones_jti', ['jti'], { unique: true })
export class Sesion {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'usuario_id', type: 'uuid' })
  usuarioId: string;

  @ManyToOne(() => Usuario, { onDelete: 'CASCADE', nullable: false })
  @JoinColumn({ name: 'usuario_id' })
  usuario: Usuario;

  /**
   * Identificador único del token emitido (*JWT ID*).
   *
   * Es lo que permite revocar una sesión concreta: al cerrar sesión se marca
   * `revocada_en` y, aunque el token siga siendo criptográficamente válido
   * hasta su expiración, deja de aceptarse.
   */
  @Column({ name: 'jti', type: 'uuid' })
  jti: string;

  @Column({ name: 'emitida_en', type: 'timestamptz', default: () => 'now()' })
  emitidaEn: Date;

  @Column({ name: 'expira_en', type: 'timestamptz' })
  expiraEn: Date;

  /** Cuándo se cerró la sesión. Nulo mientras siga abierta. */
  @Column({ name: 'revocada_en', type: 'timestamptz', nullable: true })
  revocadaEn: Date | null;

  /**
   * Desde dónde se inició.
   *
   * Es información de auditoría, no de identificación: sirve para que alguien
   * reconozca un acceso que no hizo. Se guarda recortada y sin más
   * tratamiento; no se usa para restringir nada, porque una IP cambia
   * constantemente en móvil.
   */
  @Column({ name: 'direccion_ip', type: 'varchar', length: 45, nullable: true })
  direccionIp: string | null;

  @Column({ name: 'agente_usuario', type: 'varchar', length: 255, nullable: true })
  agenteUsuario: string | null;

  /** Generación vigente del token de renovación (DECISIONES.md §21). */
  @Column({ name: 'generacion_renovacion', type: 'integer', default: 0 })
  generacionRenovacion: number;

  /** Hasta cuándo se puede renovar. Cada renovación la aplaza. */
  @Column({ name: 'renovacion_expira_en', type: 'timestamptz', nullable: true })
  renovacionExpiraEn: Date | null;

  @Column({ name: 'renovada_en', type: 'timestamptz', nullable: true })
  renovadaEn: Date | null;

  /** Por qué se cerró, si fue por algo que la persona deba saber. */
  @Column({ name: 'motivo_revocacion', type: 'varchar', length: 20, nullable: true })
  motivoRevocacion: 'REUTILIZACION' | null;

  @CreateDateColumn({ name: 'creada_en', type: 'timestamptz' })
  creadaEn: Date;
}
