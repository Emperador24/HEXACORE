import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsUUID } from 'class-validator';

export class CrearEmpleadoDto {
  /** `id` del usuario en el Servicio de Administración (CU-027). */
  @ApiProperty({ description: 'id del usuario en Administración (CU-027)' })
  @IsUUID()
  usuarioId: string;

  @ApiProperty({ example: 'Luis Ramírez' })
  @IsString()
  @IsNotEmpty()
  nombre: string;

  @ApiProperty({ example: 'Entrada' })
  @IsString()
  @IsNotEmpty()
  rol: string;

  /** Lo que se escanea en el punto de control: QR o NFC del carné, no un correo. */
  @ApiProperty({ example: 'HXC-CARNET-00231' })
  @IsString()
  @IsNotEmpty()
  credencial: string;
}
