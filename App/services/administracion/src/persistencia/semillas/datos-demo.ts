import { EstadoCuenta } from '../entidades/usuario.entity';
import { NombreRol } from '../entidades/rol.entity';

/**
 * Cuentas de demostración del CU-027.
 *
 * Como en el servicio de Entradas, **cada cuenta existe para ejercitar un
 * camino concreto** de la ficha, no para rellenar.
 *
 * ## Los identificadores no son aleatorios
 *
 * Ana, Bruno y Carla llevan **los mismos UUID** que la semilla del servicio de
 * Entradas (`a0000001-…`, `a0000002-…`, `a0000003-…`). Es imprescindible: en
 * `entradas` esos identificadores aparecen como `propietario_id` y
 * `vendedor_id`, y si aquí fueran otros, las entradas de la demo pertenecerían
 * a cuentas que no existen.
 *
 * Es la contrapartida de que ADR-01 prohíba las llaves foráneas entre bases:
 * la coherencia entre dominios la sostiene el acuerdo sobre los
 * identificadores, no el motor.
 */

/** La contraseña de todas las cuentas de demostración. */
export const CONTRASENA_DEMO = 'hexacore2026';

export interface UsuarioDemo {
  id: string;
  nombre: string;
  email: string;
  estado: EstadoCuenta;
  roles: NombreRol[];
  /** Qué camino del CU-027 permite probar esta cuenta. */
  paraQue: string;
}

export const USUARIOS: UsuarioDemo[] = [
  {
    // Mismo id que en la semilla de entradas: es la dueña de TCK-2026-000001.
    id: 'a0000001-0000-4000-8000-000000000001',
    nombre: 'Ana Gómez',
    email: 'cliente@hexacore.com',
    estado: EstadoCuenta.ACTIVA,
    roles: [NombreRol.CLIENTE],
    paraQue: 'Camino feliz: login y reventa (es la dueña de las entradas de la demo)',
  },
  {
    id: 'a0000002-0000-4000-8000-000000000002',
    nombre: 'Bruno Díaz',
    email: 'bruno@hexacore.com',
    estado: EstadoCuenta.ACTIVA,
    roles: [NombreRol.CLIENTE],
    paraQue: 'Comprador en el mercado secundario',
  },
  {
    id: 'a0000003-0000-4000-8000-000000000003',
    nombre: 'Carla Ruiz',
    email: 'carla@hexacore.com',
    estado: EstadoCuenta.ACTIVA,
    roles: [NombreRol.CLIENTE],
    paraQue: 'Segunda compradora, para las compras simultáneas de CU-006H',
  },
  {
    id: 'a0000004-0000-4000-8000-000000000004',
    nombre: 'Luis Ramírez',
    email: 'personal@hexacore.com',
    estado: EstadoCuenta.ACTIVA,
    roles: [NombreRol.PERSONAL],
    paraQue: 'Rol Personal: comprobar que no puede usar endpoints de Cliente',
  },
  {
    id: 'a0000005-0000-4000-8000-000000000005',
    nombre: 'Isabel Rojas',
    email: 'admin@hexacore.com',
    estado: EstadoCuenta.ACTIVA,
    roles: [NombreRol.ADMINISTRADOR, NombreRol.PERSONAL],
    paraQue: 'Administrador con dos roles: prueba que la asignación múltiple funciona',
  },
  // Las tres siguientes existen porque la app móvil ya las usaba como cuentas
  // de ejemplo de Personal, cada una con un área operativa distinta. El área
  // es del dominio de Personal (CU-007) y la app la asigna por correo mientras
  // ese servicio no exista.
  {
    id: 'a0000008-0000-4000-8000-000000000008',
    nombre: 'Marta Gómez',
    email: 'parqueadero@hexacore.com',
    estado: EstadoCuenta.ACTIVA,
    roles: [NombreRol.PERSONAL],
    paraQue: 'Personal de parqueadero en la app móvil',
  },
  {
    id: 'a0000009-0000-4000-8000-000000000009',
    nombre: 'Carlos Peña',
    email: 'restaurante@hexacore.com',
    estado: EstadoCuenta.ACTIVA,
    roles: [NombreRol.PERSONAL],
    paraQue: 'Personal de restaurante en la app móvil',
  },
  {
    id: 'a0000010-0000-4000-8000-000000000010',
    nombre: 'Jorge Rincón',
    email: 'jefepersonal@hexacore.com',
    estado: EstadoCuenta.ACTIVA,
    roles: [NombreRol.PERSONAL],
    paraQue: 'Jefe de personal en la app móvil',
  },
  {
    id: 'a0000006-0000-4000-8000-000000000006',
    nombre: 'Pedro Sin Verificar',
    email: 'pendiente@hexacore.com',
    estado: EstadoCuenta.PENDIENTE_VERIFICACION,
    roles: [NombreRol.CLIENTE],
    paraQue: 'Cuenta sin verificar: no debe poder iniciar sesión (paso 7)',
  },
  {
    id: 'a0000007-0000-4000-8000-000000000007',
    nombre: 'Marta Desactivada',
    email: 'desactivada@hexacore.com',
    estado: EstadoCuenta.DESACTIVADA,
    roles: [NombreRol.CLIENTE],
    paraQue: 'Cuenta desactivada por un administrador — CU-027B',
  },
];
