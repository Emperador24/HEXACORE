/**
 * Modelos base del Portal Web Administrativo/Operativo (SAD §8). Por ahora
 * son solo la forma de los datos que consume la UI con datos mock — la carga
 * real vendrá del API Gateway cuando el backend esté disponible, igual que
 * en app-movil-cliente (ver data/Modelos.kt allá para el mismo patrón).
 */

/** Los tres roles que comparten este portal (a diferencia del móvil, aquí no hay rol Cliente). */
export enum RolAdmin {
  ORGANIZADOR = 'ORGANIZADOR',
  ADMINISTRADOR = 'ADMINISTRADOR',
  SUPERVISOR_EMERGENCIA = 'SUPERVISOR_EMERGENCIA'
}

export interface Usuario {
  id: string;
  nombre: string;
  correo: string;
  rol: RolAdmin;
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
