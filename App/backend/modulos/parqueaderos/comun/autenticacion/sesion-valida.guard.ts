/**
 * La guarda de sesión es común a los módulos del Núcleo: vive en
 * `compartido/seguridad/sesion-valida.guard.ts`, con los permisos dinámicos de
 * CU-028. Se reexporta aquí para que los controladores sigan importándola de
 * su módulo.
 */
export {
  AccionPermiso,
  ModuloPermisos,
  PREFIJO_REVOCADA,
  RolesPermitidos,
  SesionValida,
  tienePermiso,
} from '../../../../compartido/seguridad/sesion-valida.guard';
export type { PeticionConSesion, SesionVerificada } from '../../../../compartido/seguridad/sesion-valida.guard';
