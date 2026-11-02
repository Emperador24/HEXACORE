import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsNumber, IsPositive, IsString, Length, Matches, MaxLength } from 'class-validator';
import { ResultadoCobro } from '../procesador-pagos';

/** Monedas admitidas. Cerrado a propósito: una moneda desconocida es un error, no un dato. */
const MONEDAS = ['COP', 'USD'] as const;

export class CobrarDto {
  @ApiProperty({ description: 'Id de la transacción del llamante. Reintentar con la misma no cobra dos veces.' })
  @IsString()
  @Length(8, 128)
  claveIdempotencia: string;

  @ApiProperty({ description: 'Quién pide el cobro: entradas, alimentos…' })
  @IsString()
  @Length(2, 60)
  solicitante: string;

  @ApiProperty({ example: 120000 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  monto: number;

  @ApiProperty({ enum: MONEDAS })
  @IsIn(MONEDAS as unknown as string[])
  moneda: string;

  @ApiProperty({ description: 'Token opaco del medio de pago. RNF-05: aquí nunca llegan datos de tarjeta.' })
  @IsString()
  @Length(4, 200)
  token: string;

  @ApiProperty()
  @IsString()
  @MaxLength(200)
  descripcion: string;
}

export class ReembolsarDto {
  @ApiProperty()
  @IsString()
  @Length(8, 128)
  claveIdempotencia: string;

  @ApiProperty()
  @IsString()
  @Length(2, 60)
  solicitante: string;

  @ApiProperty({ description: 'La referencia que devolvió la pasarela al aprobar el cobro.' })
  @IsString()
  @Matches(/^pas_[0-9a-f-]{36}$/i, { message: 'referenciaCobro no tiene la forma de una referencia de la pasarela' })
  referenciaCobro: string;

  @ApiProperty()
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  monto: number;

  @ApiProperty({ enum: MONEDAS })
  @IsIn(MONEDAS as unknown as string[])
  moneda: string;

  @ApiProperty()
  @IsString()
  @MaxLength(200)
  motivo: string;
}

export class RespuestaPagoDto {
  @ApiProperty({ enum: ResultadoCobro })
  resultado: ResultadoCobro;

  @ApiProperty({ nullable: true })
  referencia: string | null;

  @ApiProperty({ nullable: true })
  motivo: string | null;

  @ApiProperty({ description: 'true si se devolvió lo ya guardado en vez de volver a la pasarela.' })
  repetida: boolean;
}
