import { IsBoolean } from 'class-validator';

/**
 * Aprobar o rechazar una solicitud de cambio de turno.
 *
 * **Ya no lleva `supervisorId`.** Antes el cliente decía quién revisaba, lo que
 * significaba que cualquiera podía firmar la aprobación con el nombre de otro.
 * Ahora quien revisa sale del token de sesión, que no se puede falsificar, y el
 * servicio comprueba además que esa persona sea jefe de personal.
 */
export class RevisarSolicitudDto {
  @IsBoolean()
  aprobar: boolean;
}
