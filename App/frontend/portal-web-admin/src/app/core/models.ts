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
export const ROLES_DEL_PORTAL: readonly string[] = [Rol.ADMINISTRADOR, Rol.ORGANIZADOR, Rol.PERSONAL];

/** Cualquier rol que no sea uno de estos es un rol propio de CU-028, con su matriz de permisos. */
export const ROLES_DEL_SISTEMA: readonly string[] = Object.values(Rol);

export interface Usuario {
  id: string;
  nombre: string;
  correo: string;
  /** Roles del CU-028. Una cuenta puede tener varios (admin@hexacore.com tiene dos). */
  roles: string[];
  /** Permisos de sus roles propios (`modulo:accion`), CU-028. Solo deciden qué se muestra. */
  permisos: string[];
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
  /** CU-029: posición en el plano (en %) y color; nulos si no se dibujó. */
  x?: number | null;
  y?: number | null;
  ancho?: number | null;
  alto?: number | null;
  color?: string | null;
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

// --- CU-029: Gestión de recintos y zonas -------------------------------------------

export interface ZonaEditable {
  id?: string;
  nombre: string;
  capacidad: number;
  /** Rectángulo en el plano, en % del ancho y alto. */
  x?: number | null;
  y?: number | null;
  ancho?: number | null;
  alto?: number | null;
  color?: string | null;
}

export interface RecintoResumen extends Recinto {
  eventosActivos: number;
  eventosTotales: number;
  tienePlano: boolean;
}

export interface DetalleRecinto {
  recinto: Recinto;
  eventos: { id: string; nombre: string; estado: EstadoEvento; fechaInicio: string; fechaFin: string; aforoMaximo: number }[];
  plano: { tipo: string; tamano: number; actualizadoEn: string } | null;
  mensaje?: string;
}

export interface DatosRecinto {
  nombre: string;
  ciudad: string;
  direccion?: string;
  capacidad: number;
  activo: boolean;
  zonas: ZonaEditable[];
  confirmarImpacto?: boolean;
}

// --- CU-019: Monitorear el evento ---------------------------------------------------

export interface EventoMonitoreable {
  id: string;
  nombre: string;
  recinto: string | null;
  ciudad: string | null;
  fechaInicio: string;
  fechaFin: string;
  aforoMaximo: number;
  enCurso: boolean;
}

export interface PuntoAccesoPanel {
  nombre: string;
  estado: 'HABILITADO' | 'CERRADO';
  alternativa: string | null;
  total: number;
  ultimos5: number;
  ultimos10: number;
  ultimaHora: number;
  ultimoIngreso: string | null;
}

export interface AlertaPanel {
  id: string;
  tipo: string;
  clave: string;
  severidad: 'info' | 'aviso' | 'critica';
  mensaje: string;
  sugerencia: { accion?: string; texto?: string; punto?: string; alternativa?: string | null; hacia?: string } | null;
  creadaEn: string;
  resueltaEn: string | null;
}

export type TipoDecision = 'REDISTRIBUIR_PERSONAL' | 'CERRAR_ACCESO' | 'HABILITAR_ACCESO' | 'ESCALAR_INCIDENTE' | 'OTRA';

export interface DecisionPanel {
  id: string;
  tipo: TipoDecision;
  descripcion: string;
  zona: string | null;
  puntoAcceso: string | null;
  alternativa: string | null;
  alertaId: string | null;
  resultado: string | null;
  fecha: string;
  resultadoEn: string | null;
}

export interface PanelMonitoreo {
  evento: { id: string; nombre: string; fechaInicio: string; fechaFin: string; recinto: string | null; ciudad: string | null; enCurso: boolean };
  aforo: { asistentes: number; aforoMaximo: number; porcentaje: number; disponibles: number };
  accesos: { ultimos5min: number; flujoPorMinuto: number; porMinuto: { minuto: string; ingresos: number }[]; puntos: PuntoAccesoPanel[] };
  personal: {
    zonas: { zonaId: string; nombre: string; rolRequerido: string; requeridos: number; asignados: number; confirmados: number; presentes: number; deficit: number }[];
    requeridos: number;
    asignados: number;
    presentes: number;
  };
  /** CU-025: la ocupación del parqueadero cuando el evento tiene zonas configuradas. */
  parqueaderos: { disponible: boolean; motivo?: string; capacidad?: number; ocupados?: number; porcentaje?: number; alertas?: AlertaParqueadero[] };
  incidencias: { disponible: boolean; motivo: string };
  alertas: AlertaPanel[];
  decisiones: DecisionPanel[];
  actualizadoEn: string;
}

// --- CU-008: cambios de turno --------------------------------------------------

export type EstadoSolicitudCambio = 'PENDIENTE' | 'SIN_REEMPLAZO' | 'APROBADA' | 'RECHAZADA' | 'BLOQUEADA_POR_HORAS' | 'CANCELADA';

export interface SolicitudCambio {
  id: string;
  turnoId: string;
  turno: Turno;
  motivo: string;
  estado: EstadoSolicitudCambio;
  empleadoReemplazoId: string | null;
  empleadoReemplazo: Empleado | null;
  empleadoSolicitanteId: string | null;
  respuestaReemplazo: 'PENDIENTE' | 'ACEPTADA' | 'RECHAZADA' | null;
  reemplazosDescartados: string[];
  revisadoPorId: string | null;
  motivoRechazoOBloqueo: string | null;
  fechaSolicitud: string;
  fechaRevision: string | null;
}

export interface ReemplazosSolicitud {
  solicitudId: string;
  propuestoId: string | null;
  candidatos: Candidato[];
}

// --- CU-009: reporte de asistencia --------------------------------------------

export interface FilaReporteAsistencia {
  empleadoId: string;
  nombre: string;
  rol: string;
  turnos: number;
  horasProgramadas: number;
  horasTrabajadas: number;
  entradas: number;
  tardias: number;
  anticipadas: number;
  salidasAnticipadas: number;
  salidasPosteriores: number;
  anomalias: number;
  estado: 'EN_TURNO' | 'FUERA_DE_TURNO';
}

export interface ReporteAsistencia {
  totales: { empleados: number; enTurno: number; horasProgramadas: number; horasTrabajadas: number; tardias: number; anomalias: number };
  empleados: FilaReporteAsistencia[];
}

// --- CU-010: evacuación ante emergencias ----------------------------------------

export const TIPOS_EMERGENCIA = [
  ['INCENDIO', 'Incendio'],
  ['AMENAZA_SEGURIDAD', 'Amenaza de seguridad'],
  ['EMERGENCIA_MEDICA', 'Emergencia médica masiva'],
  ['FALLA_ESTRUCTURAL', 'Falla estructural'],
  ['INUNDACION', 'Inundación'],
  ['PREVENTIVA', 'Evacuación preventiva'],
  ['OTRA', 'Otra']
] as const;

export interface SalidaEmergencia {
  id: string;
  nombre: string;
  capacidadPorMinuto: number | null;
  habilitada: boolean;
  motivoBloqueo: string | null;
}

export interface RutaEvacuacion {
  id: string;
  zonaId: string;
  salidaId: string;
  salida: string;
  prioridad: number;
  descripcion: string | null;
  habilitada?: boolean;
}

export interface PlanEvacuacion {
  recinto: { id: string; nombre: string; ciudad: string };
  salidas: SalidaEmergencia[];
  zonas: { id: string; nombre: string; capacidad: number; rutas: RutaEvacuacion[] }[];
  completo: boolean;
  zonasSinRuta: string[];
}

export interface EventoEmergencia {
  id: string;
  nombre: string;
  recinto: string | null;
  recintoId: string;
  fechaInicio: string;
  fechaFin: string;
  enCurso: boolean;
  evacuacion: { id: string; estado: string; nivel: number } | null;
}

export interface ZonaEvacuacion {
  zonaId: string;
  nombre: string;
  capacidad: number;
  ocupacionEstimada: number;
  personasRestantes: number;
  estado: 'PENDIENTE' | 'EN_CURSO' | 'EVACUADA';
  salidaId: string | null;
  salidaNombre: string | null;
  instruccion: string | null;
  incorporadaEnNivel: number;
  rutas: RutaEvacuacion[];
}

export interface AlertaEvacuacion {
  tipo: 'SIN_RUTA' | 'ZONA_CONGESTIONADA' | 'SALIDA_SATURADA';
  severidad: 'aviso' | 'critica';
  zonaId?: string;
  salidaId?: string;
  mensaje: string;
  sugerencia?: { zonaId: string; salidaId: string; salida: string; texto: string };
}

export interface Evacuacion {
  id: string;
  eventoId: string;
  recintoId: string;
  tipo: string;
  ubicacion: string;
  nivel: number;
  alcance: 'PARCIAL' | 'TOTAL';
  estado: 'PROPUESTA' | 'ACTIVA' | 'FINALIZADA' | 'DESCARTADA';
  creadaEn: string;
  activadaEn: string | null;
  finalizadaEn: string | null;
  observaciones: string | null;
}

export interface DetalleEvacuacion {
  evacuacion: Evacuacion;
  zonas: ZonaEvacuacion[];
  salidas: SalidaEmergencia[];
  alertas: AlertaEvacuacion[];
  resumen: { zonas: number; evacuadas: number; personasRestantes: number; ocupacionEstimadaInicial: number };
  personal: { asignados: number; presentes: number };
  avisos: {
    total: number;
    pendientes: number;
    entregados: number;
    lista: { id: string; canal: string; mensaje: string; prioridad: number; creadaEn: string; entregadaEn: string | null }[];
  };
  bitacora: { id: string; tipo: string; detalle: Record<string, unknown>; fecha: string }[];
  actualizadoEn: string;
}

// --- CU-024 y CU-025: parqueaderos -------------------------------------------------

export interface Tarifa {
  id: string;
  valorHora: number;
  vigenteDesde: string;
  definidaPor: string;
  motivo: string | null;
}

export interface ZonaParqueadero {
  id: string;
  nombre: string;
  capacidad: number;
  orden: number;
  ocupados: number;
  /** Espacios retenidos por reservas vigentes (CU-021). */
  reservados: number;
  disponibles: number;
  porcentaje: number;
  estado: 'DISPONIBLE' | 'CASI_LLENA' | 'LLENA';
  tendencia: { ingresos: number; salidas: number; netoPorMinuto: number; minutosParaLlenarse: number | null };
}

export interface AlertaParqueadero {
  tipo: 'ZONA_LLENA' | 'ZONA_CASI_LLENA' | 'LLENADO_RAPIDO';
  severidad: 'aviso' | 'critica';
  zonaId: string;
  mensaje: string;
  sugerencia?: { zonaDestinoId: string; zona: string; texto: string };
}

export interface Redireccion {
  id: string;
  zonaOrigenId: string | null;
  zonaOrigen: string | null;
  zonaDestinoId: string;
  zonaDestino: string;
  motivo: string;
  vigente: boolean;
  resultado: string | null;
  fecha: string;
  terminadaEn: string | null;
  ingresosAlDestino: number;
}

export interface PanelParqueadero {
  evento: { id: string; nombre: string; fechaInicio: string; fechaFin: string; enCurso: boolean };
  total: { capacidad: number; ocupados: number; reservados: number; disponibles: number; porcentaje: number };
  zonas: ZonaParqueadero[];
  alertas: AlertaParqueadero[];
  recomendacion: { zona: { id: string; nombre: string; disponibles: number; porcentaje: number } | null; motivo: 'REDIRECCION' | 'MENOS_OCUPADA' | 'SIN_ESPACIO' };
  redirecciones: Redireccion[];
  actualizadoEn: string;
}

export interface SalidaVehiculo {
  estancia: { id: string; placa: string; zona: string; espacio: string | null; ingresoEn: string; salidaEn: string; prepagada: boolean };
  cobro: { prepagada: boolean; pendiente: boolean; horas: number | null; valorHora: number | null; monto: number | null; mensaje: string };
  permanenciaMinutos: number | null;
  repetida: boolean;
}

export type TipoVehiculo = 'AUTOMOVIL' | 'MOTO' | 'DISCAPACIDAD';

/** CU-022, paso 4: lo que el operador le indica al conductor. */
export interface IngresoVehiculo {
  estancia: { id: string; placa: string; zona: string; espacio: string | null; prepagada: boolean; tipoVehiculo: TipoVehiculo };
  asignacion: { zona: string; espacio: string | null; conReserva: boolean; reasignado: boolean; detalle: string | null };
}

/** CU-023: un espacio de una zona y lo que lo ocupa. */
export interface EspacioParqueadero {
  id: string;
  zonaId: string;
  zona: string;
  numero: number;
  codigo: string;
  tipo: TipoVehiculo;
  prioridad: number;
  activo: boolean;
  estado: 'LIBRE' | 'RESERVADO' | 'OCUPADO' | 'INACTIVO';
  placa: string | null;
}

/** CU-023, paso 8: historial de asignaciones y liberaciones. */
export interface AsignacionEspacio {
  id: string;
  zona: string;
  espacio: string;
  origen: 'RESERVA' | 'INGRESO' | 'REASIGNACION' | 'LIBERACION';
  placa: string;
  tipoVehiculo: TipoVehiculo;
  detalle: string | null;
  fecha: string;
}

/** CU-021: una reserva del evento, vista por el organizador (sin el QR). */
export interface ReservaParqueaderoEvento {
  id: string;
  zona: string;
  espacio: string;
  placa: string;
  tipoVehiculo: TipoVehiculo;
  estado: 'PENDIENTE_PAGO' | 'PAGANDO' | 'CONFIRMADA' | 'USADA' | 'EXPIRADA';
  monto: number;
  creadaEn: string;
  expiraEn: string;
}

// --- CU-028: roles y permisos ---------------------------------------------------

export interface PermisoRol {
  modulo: string;
  accion: string;
}

export interface RolConPermisos {
  id: string;
  nombre: string;
  descripcion: string;
  delSistema: boolean;
  version: number;
  permisos: PermisoRol[];
  usuarios: number;
  actualizadoEn: string;
}

export interface CatalogoPermisos {
  modulos: { id: string; nombre: string }[];
  acciones: string[];
}

export interface DetalleRol extends RolConPermisos {
  asignados: { id: string; nombre: string; email: string; estado: string; asignadoEn: string }[];
  auditoria: { accion: string; realizadaPor: string; detalle: Record<string, unknown>; fecha: string }[];
}
