import { ApiProperty } from '@nestjs/swagger';

export enum EstadoTurno {
  /** Puede comprar ya. Lleva token. */
  ADMITIDO = 'ADMITIDO',
  /** Hay más gente de la que Ventas aguanta a la vez. Lleva posición. */
  EN_ESPERA = 'EN_ESPERA',
}

export class TurnoDto {
  @ApiProperty({ enum: EstadoTurno })
  estado: EstadoTurno;

  @ApiProperty({ nullable: true, description: 'Token de un solo uso. Se manda en X-Turno-Cola al reservar y lo gasta el gateway.' })
  token: string | null;

  @ApiProperty({ nullable: true })
  expiraEn: string | null;

  @ApiProperty({ nullable: true, description: 'Puesto en la fila, 1 es el primero.' })
  posicion: number | null;

  @ApiProperty({ nullable: true, description: 'Segundos que conviene esperar antes de volver a preguntar.' })
  reintentarEnSegundos: number | null;
}

export class EstadoColaDto {
  @ApiProperty({ description: 'Cuántos tienen turno vivo ahora mismo.' })
  comprando: number;

  @ApiProperty()
  enEspera: number;
}
