import {
  Column,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  type Relation,
} from 'typeorm';
import { Turno } from './turno.entity.js';

/**
 * Un empleado: la ficha **operativa** de una persona que trabaja en el evento.
 *
 * ## Por qué tiene `usuarioId` y no nombre de usuario ni contraseña
 *
 * Las cuentas viven en el Servicio de Administración (CU-027): allí están el
 * correo, la contraseña cifrada y los roles. Aquí solo está lo que este dominio
 * necesita saber —en qué área trabaja, qué credencial escanea, cuántas horas
 * lleva— enlazado a esa cuenta por su identificador.
 *
 * `usuarioId` es una **referencia lógica**, no una llave foránea: cada
 * microservicio tiene su propia base (ADR-01) y no hay forma de escribir un
 * JOIN entre dominios. Quien garantiza que ese identificador existe es el
 * momento del alta: solo un administrador puede crear un empleado, y lo hace
 * sobre una cuenta que él mismo acaba de ver.
 *
 * ## Por qué el alta la hace un administrador
 *
 * Un empleado no se registra solo. Trabajar en un evento no es algo que uno se
 * conceda: alguien con autoridad decide que esa persona entra, en qué área y
 * con qué credencial. Por eso `POST /empleados` exige rol Administrador, y por
 * eso no existe un "registro de empleado" público.
 */
@Entity('empleados')
export class Empleado {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /**
   * La cuenta del CU-027 a la que pertenece esta ficha. Es lo que permite que,
   * al iniciar sesión, la app sepa qué empleado es quien entra.
   *
   * Único: una cuenta no puede ser dos empleados a la vez.
   */
  @Index('ux_empleados_usuario', { unique: true })
  @Column({ name: 'usuario_id', type: 'uuid' })
  usuarioId: string;

  @Column()
  nombre: string;

  /**
   * Área de trabajo: `Entrada`, `Parqueadero`, `Restaurante` o
   * `Jefe de personal`. **No es el rol de la cuenta.**
   *
   * El rol de la cuenta (Cliente, Personal, Organizador, Administrador) dice
   * *qué puede hacer* en el sistema y vive en Administración. Esto dice *qué
   * hace en el evento*, y es lo que decide qué pantallas ve en la app: quien
   * está en Parqueadero no necesita —ni debe— ver la validación de entradas.
   */
  @Column()
  rol: string;

  /**
   * Lo que se escanea en el punto de control: el QR o NFC del carné.
   *
   * No identifica por sí sola a nadie para autenticarse — para eso está el
   * token de sesión. Sirve para el registro de asistencia presencial y queda
   * anotada en cada marcación.
   */
  @Column({ unique: true })
  credencial: string;

  @Column({ default: true })
  activo: boolean;

  @Column('float', { name: 'horasTrabajadasTotales', default: 0 })
  horasTrabajadasTotales: number;

  @OneToMany(() => Turno, (turno) => turno.empleado)
  turnos: Relation<Turno>[];
}
