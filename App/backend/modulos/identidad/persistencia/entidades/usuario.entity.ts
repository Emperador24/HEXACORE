import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/**
 * Estado de una cuenta.
 *
 * Los tres salen del propio CU-027: el paso 4 crea la cuenta, el 5-7 la
 * verifica y la activa (*"activa la cuenta y permite el inicio de sesión"*), y
 * el flujo alterno **CU-027B** la desactiva (*"el usuario no puede iniciar
 * sesión hasta que sea reactivada"*).
 *
 * `DESACTIVADA` es distinto de estar bloqueada por fuerza bruta (CU-027D): lo
 * primero lo decide un administrador y dura hasta que lo revierta; lo segundo
 * es automático y se cura solo al pasar los minutos de bloqueo. Por eso el
 * bloqueo son dos columnas y no un estado.
 */
export enum EstadoCuenta {
  /** Registrada pero sin confirmar el correo. No puede iniciar sesión (paso 7). */
  PENDIENTE_VERIFICACION = 'PENDIENTE_VERIFICACION',
  ACTIVA = 'ACTIVA',
  /** Un administrador la desactivó — CU-027B. */
  DESACTIVADA = 'DESACTIVADA',
}

/**
 * Cuenta de usuario (SAD §12: `Usuario(id, nombre, email, credenciales)`).
 *
 * Es la entidad más transversal del sistema: el `propietario_id` de una
 * entrada, el `vendedor_id` de una publicación y el `comprador_id` de una
 * transacción apuntan todos aquí — desde otra base de datos y sin llave
 * foránea, como manda ADR-01.
 */
@Entity({ name: 'usuarios' })
// Índice para el login: se busca por correo en cada intento.
@Index('idx_usuarios_email', ['email'], { unique: true })
export class Usuario {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'nombre', type: 'varchar', length: 160 })
  nombre: string;

  /**
   * Correo, **siempre en minúsculas**.
   *
   * La normalización ocurre antes de guardar y antes de buscar. Sin ella,
   * `Ana@hexacore.com` y `ana@hexacore.com` serían dos cuentas distintas, y el
   * paso 3 del CU-027 —*"verifica que el correo no esté registrado
   * previamente"*— se saltaría con solo cambiar una mayúscula.
   */
  @Column({ name: 'email', type: 'varchar', length: 254 })
  email: string;

  /**
   * Resultado de aplicar `scrypt` a la contraseña, con su salt.
   *
   * **Nunca contiene la contraseña.** El formato lo encapsula el módulo de
   * hash; aquí es una cadena opaca. Si alguien lee esta tabla, no obtiene
   * contraseñas: obtiene hashes que habría que romper uno a uno, y `scrypt`
   * está diseñado para que eso salga caro.
   */
  @Column({ name: 'hash_contrasena', type: 'varchar', length: 255 })
  hashContrasena: string;

  @Column({
    name: 'estado',
    type: 'enum',
    enum: EstadoCuenta,
    enumName: 'estado_cuenta',
    default: EstadoCuenta.PENDIENTE_VERIFICACION,
  })
  estado: EstadoCuenta;

  /** Cuándo se confirmó el correo (paso 6). Nulo mientras no se verifique. */
  @Column({ name: 'verificado_en', type: 'timestamptz', nullable: true })
  verificadoEn: Date | null;

  /**
   * Intentos de inicio de sesión fallidos **consecutivos** — CU-027D.
   *
   * Vuelve a cero en cuanto alguien entra bien. Es el contador que dispara el
   * bloqueo al llegar al umbral configurado.
   */
  @Column({ name: 'intentos_fallidos', type: 'integer', default: 0 })
  intentosFallidos: number;

  /**
   * Hasta cuándo está bloqueada por fuerza bruta — CU-027D.
   *
   * Se guarda el instante en que expira y no un booleano: así el bloqueo se
   * levanta solo al pasar el tiempo, sin necesidad de un proceso que recorra
   * la tabla desbloqueando cuentas.
   */
  @Column({ name: 'bloqueada_hasta', type: 'timestamptz', nullable: true })
  bloqueadaHasta: Date | null;

  /** Último inicio de sesión correcto. Parte del *"registra el inicio de sesión"* del paso 9. */
  @Column({ name: 'ultimo_acceso_en', type: 'timestamptz', nullable: true })
  ultimoAccesoEn: Date | null;

  /**
   * Cuándo un administrador eliminó la cuenta. Nulo si no se ha eliminado.
   *
   * Eliminar **anonimiza** la fila en lugar de borrarla: su id sigue apareciendo
   * como dueño o vendedor en las bases de otros servicios, que no tienen llave
   * foránea hacia aquí (ADR-01). Ver DECISIONES.md §19.
   */
  @Column({ name: 'eliminada_en', type: 'timestamptz', nullable: true })
  eliminadaEn: Date | null;

  @CreateDateColumn({ name: 'creado_en', type: 'timestamptz' })
  creadoEn: Date;

  @UpdateDateColumn({ name: 'actualizado_en', type: 'timestamptz' })
  actualizadoEn: Date;
}
