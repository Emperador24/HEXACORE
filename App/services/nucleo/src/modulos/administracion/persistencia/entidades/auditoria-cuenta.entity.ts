import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { EstadoCuenta } from './usuario.entity';

export enum AccionCuenta {
  /** Una cuenta pendiente de verificar pasa a activa por decisión de un administrador. */
  ACTIVAR = 'ACTIVAR',
  /** Una cuenta desactivada vuelve a estar activa — el "hasta que sea reactivada" de CU-027B. */
  REACTIVAR = 'REACTIVAR',
  DESACTIVAR = 'DESACTIVAR',
  ELIMINAR = 'ELIMINAR',
}

/** Una acción de un administrador sobre una cuenta. Solo inserción (ver la migración). */
@Entity({ name: 'auditoria_cuentas' })
export class AuditoriaCuenta {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'cuenta_id', type: 'uuid' })
  cuentaId: string;

  @Column({ name: 'accion', type: 'varchar', length: 20 })
  accion: AccionCuenta;

  @Column({ name: 'estado_anterior', type: 'enum', enum: EstadoCuenta, enumName: 'estado_cuenta' })
  estadoAnterior: EstadoCuenta;

  @Column({ name: 'estado_nuevo', type: 'enum', enum: EstadoCuenta, enumName: 'estado_cuenta' })
  estadoNuevo: EstadoCuenta;

  @Column({ name: 'realizada_por', type: 'uuid' })
  realizadaPor: string;

  @Column({ name: 'motivo', type: 'varchar', length: 300, nullable: true })
  motivo: string | null;

  @Column({ name: 'sesiones_cerradas', type: 'integer', default: 0 })
  sesionesCerradas: number;

  @Column({ name: 'fecha', type: 'timestamptz', default: () => 'now()' })
  fecha: Date;
}
