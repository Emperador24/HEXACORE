import { Transform } from 'class-transformer';
import { IsEnum, IsString, IsUUID, Length, Matches } from 'class-validator';
import { EstadoEstablecimiento } from '../persistencia/entidades/establecimiento.entity';

const texto = ({ value }: { value: unknown }) => typeof value === 'string' ? value.trim().replace(/\s+/gu, ' ').normalize('NFC') : value;

export class EstadoEstablecimientoDto {
  @IsEnum(EstadoEstablecimiento, { message: 'Selecciona un estado válido.' })
  estado: EstadoEstablecimiento;
}

export class GuardarEstablecimientoDto extends EstadoEstablecimientoDto {
  @Transform(({ value }) => typeof value === 'string' ? value.toLowerCase() : value)
  @IsUUID()
  eventoId: string;

  @Transform(texto) @IsString() @Length(2, 200, { message: 'El nombre debe tener entre 2 y 200 caracteres.' })
  nombre: string;

  @Transform(texto) @IsString() @Length(3, 200, { message: 'Completa la información de contacto (3–200 caracteres).' })
  contacto: string;

  @Transform(texto) @IsString() @Length(2, 200, { message: 'Completa el punto de entrega (2–200 caracteres).' })
  puntoEntrega: string;

  @Matches(/^(?:[01]\d|2[0-3]):[0-5]\d$/, { message: 'La apertura debe usar HH:mm (00:00–23:59).' })
  horaApertura: string;

  @Matches(/^(?:[01]\d|2[0-3]):[0-5]\d$/, { message: 'El cierre debe usar HH:mm (00:00–23:59).' })
  horaCierre: string;

  @IsString() @Length(1, 80)
  zonaHoraria: string;
}
