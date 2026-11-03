/**
 * Modelos del Portal Web Administrativo/Operativo (SAD §8).
 *
 * Los de cuentas y sesión son la forma real de lo que devuelve el Servicio de
 * Administración a través del gateway.
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

// --- CU-026: Gestión de eventos -------------------------------------------------
// Forma real de lo que devuelve eventos-recintos (Núcleo) por el gateway.

export enum EstadoEvento {
  BORRADOR = 'BORRADOR',
  PUBLICADO = 'PUBLICADO',
  CANCELADO = 'CANCELADO'
}

export interface ZonaRecinto {
  id: string;
  recintoId: string;
  nombre: string;
  capacidad: number;
}

export interface Recinto {
  id: string;
  nombre: string;
  ciudad: string;
  direccion: string | null;
  capacidad: number;
  activo: boolean;
  zonas: ZonaRecinto[];
}

export interface LocalidadGestion {
  id: string;
  eventoId: string;
  zonaRecintoId: string | null;
  nombre: string;
  precio: number;
  cantidad: number;
  orden: number;
}

export interface EventoGestion {
  id: string;
  nombre: string;
  descripcion: string | null;
  categoria: string;
  artista: string | null;
  imagenUrl: string | null;
  recintoId: string;
  fechaInicio: string;
  fechaFin: string;
  aforoMaximo: number;
  permiteReventa: boolean;
  estado: EstadoEvento;
  /** Control de concurrencia: se envía al editar, publicar o cancelar. */
  version: number;
  creadoPor: string;
  creadoEn: string;
  actualizadoEn: string;
  publicadoEn: string | null;
  canceladoEn: string | null;
  motivoCancelacion: string | null;
  localidades: LocalidadGestion[];
}

/** Fila del listado. */
export interface EventoResumen extends Omit<EventoGestion, 'localidades'> {
  recinto: Pick<Recinto, 'id' | 'nombre' | 'ciudad' | 'capacidad'> | null;
  cupos: number;
  tiposDeEntrada: number;
}

export interface HistorialEvento {
  id: string;
  version: number;
  accion: string;
  estadoAnterior: EstadoEvento | null;
  estadoNuevo: EstadoEvento | null;
  realizadoPor: string;
  cambios: Record<string, unknown>;
  fecha: string;
}

export interface Disponibilidad {
  conflictos: { id: string; nombre: string; fechaInicio: string; fechaFin: string }[];
  sugerencias: { fechaInicio: string; fechaFin: string }[];
}

export interface DetalleEvento {
  evento: EventoGestion;
  recinto: Recinto | null;
  historial: HistorialEvento[];
  disponibilidad?: Disponibilidad;
  mensaje?: string;
}

/** Lo que envía el formulario (pasos 2-3). */
export interface DatosEvento {
  nombre: string;
  descripcion?: string;
  categoria: string;
  artista?: string;
  imagenUrl?: string;
  recintoId: string;
  fechaInicio: string;
  fechaFin: string;
  aforoMaximo?: number;
  permiteReventa: boolean;
  localidades: { id?: string; nombre: string; precio: number; cantidad: number; zonaRecintoId?: string }[];
  version?: number;
}

// --- CU-007: Gestión de personal para eventos --------------------------------
// Forma real de lo que devuelve Personal/Logística (Núcleo) por el gateway.

export interface Empleado {
  id: string;
  /** Cuenta de CU-027 a la que pertenece la ficha. */
  usuarioId: string;
  nombre: string;
  /** Área de trabajo: debe coincidir con el rol que pide cada zona. */
  rol: string;
  credencial: string;
  /** Nulos en las fichas dadas de alta antes de CU-007. */
  documento: string | null;
  correo: string | null;
  telefono: string | null;
  activo: boolean;
  horasTrabajadasTotales: number;
}

export type DatosEmpleado = Pick<Empleado, 'nombre' | 'rol' | 'credencial'> & {
  documento: string;
  correo: string;
  telefono: string;
};

export enum EstadoTurno {
  ASIGNADO = 'ASIGNADO',
  CAMBIO_SOLICITADO = 'CAMBIO_SOLICITADO',
  CAMBIADO = 'CAMBIADO',
  CANCELADO = 'CANCELADO'
}

/** Respuesta del empleado a la asignación (paso 13 y CU-007B). */
export enum ConfirmacionTurno {
  PENDIENTE = 'PENDIENTE',
  CONFIRMADA = 'CONFIRMADA',
  RECHAZADA = 'RECHAZADA'
}

export interface Turno {
  id: string;
  empleadoId: string;
  empleado: Empleado;
  eventoId: string;
  zona: string;
  zonaEventoId: string | null;
  horaInicio: string;
  horaFin: string;
  estado: EstadoTurno;
  confirmacion: ConfirmacionTurno;
  motivoRechazo: string | null;
  respondidoEn: string | null;
}

export interface EntradaAuditoriaPersonal {
  id: string;
  accion: string;
  empleadoId: string | null;
  turnoId: string | null;
  realizadoPor: string;
  detalle: Record<string, unknown>;
  fecha: string;
}

export interface DetalleEmpleado {
  empleado: Empleado;
  turnos: Turno[];
  auditoria: EntradaAuditoriaPersonal[];
}

/** Zona (área de trabajo) de un evento, con su cobertura actual. */
export interface ZonaEvento {
  id: string;
  eventoId: string;
  nombre: string;
  rolRequerido: string;
  personalRequerido: number;
  personalAsignado: number;
  deficit: boolean;
}

/** Paso 7: un empleado activo del rol de la zona y si puede cubrir el horario. */
export interface Candidato {
  empleado: Empleado;
  disponible: boolean;
  motivo: string | null;
  horasEseDia: number;
}

/** Un evento publicado de la cartelera (Catálogo, CU-005). */
export interface EventoCartelera {
  id: string;
  nombre: string;
  artista: string | null;
  categoria: string;
  fechaInicio: string;
  fechaFin: string | null;
  lugar: string;
  ciudad: string;
}
