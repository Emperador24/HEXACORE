/**
 * Modelos del Portal Web Administrativo/Operativo (SAD §8).
 *
 * Los de cuentas y sesión son la forma real de lo que devuelve el Servicio de
 * Administración a través del gateway. Los de evento siguen siendo la forma de
 * los datos que consume la UI con datos de ejemplo, a la espera del CU-026.
 */

/**
 * Roles del sistema, tal como los nombra el Servicio de Administración
 * (tabla `roles`). No es una lista propia del portal: si aquí dijera
 * «SUPERVISOR_EMERGENCIA» y el backend «Administrador», el menú se calcularía
 * sobre un rol que nadie puede tener.
 */
export const Rol = {
  ADMINISTRADOR: 'Administrador',
  ORGANIZADOR: 'Organizador',
  PERSONAL: 'Personal',
  CLIENTE: 'Cliente'
} as const;

export type Rol = (typeof Rol)[keyof typeof Rol];

/** Los roles que pueden entrar a este portal. Un Cliente usa el suyo; el Personal, la app. */
export const ROLES_DEL_PORTAL: readonly string[] = [Rol.ADMINISTRADOR, Rol.ORGANIZADOR];

export interface Usuario {
  id: string;
  nombre: string;
  correo: string;
  /** Roles del CU-028. Una cuenta puede tener varios (admin@hexacore.com tiene dos). */
  roles: string[];
}

/** Estados de una cuenta en el Servicio de Administración. */
export enum EstadoCuenta {
  PENDIENTE_VERIFICACION = 'PENDIENTE_VERIFICACION',
  ACTIVA = 'ACTIVA',
  DESACTIVADA = 'DESACTIVADA'
}

/** Una cuenta tal como la ve un administrador — CU-027B. */
export interface Cuenta {
  id: string;
  nombre: string;
  email: string;
  estado: EstadoCuenta;
  roles: string[];
  /** Anonimizada: no puede reactivarse. */
  eliminada: boolean;
  verificadoEn: string | null;
  /** CU-027D: bloqueo temporal por intentos fallidos. */
  bloqueadaHasta: string | null;
  ultimoAccesoEn: string | null;
  creadoEn: string;
}

export interface PaginaCuentas {
  total: number;
  cuentas: Cuenta[];
}

/** Una acción de administración sobre una cuenta, para el historial. */
export interface EntradaAuditoria {
  accion: string;
  estadoAnterior: EstadoCuenta;
  estadoNuevo: EstadoCuenta;
  realizadaPor: string;
  motivo: string | null;
  sesionesCerradas: number;
  fecha: string;
}

export interface DetalleCuenta extends Cuenta {
  auditoria: EntradaAuditoria[];
}

/** CU-026 (CRUD) + CU-016 (planificación de logística) comparten la misma entidad Evento. */
export enum EstadoEvento {
  PLANIFICACION = 'PLANIFICACION',
  PUBLICADO = 'PUBLICADO',
  EN_CURSO = 'EN_CURSO',
  FINALIZADO = 'FINALIZADO',
  CANCELADO = 'CANCELADO'
}

export interface Evento {
  id: string;
  nombre: string;
  /** yyyy-MM-dd, tal como lo entrega un <input type="date"> */
  fecha: string;
  recinto: string;
  aforo: number;
  estado: EstadoEvento;
}
