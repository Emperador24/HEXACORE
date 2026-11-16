import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsString, IsUUID, Length, Matches, Max, Min } from 'class-validator';
import { Compra, EstadoCompra } from '../../persistencia/entidades/compra.entity';
import { Entrada, EstadoEntrada } from '../../persistencia/entidades/entrada.entity';

/** Máximo de entradas por compra. Frena a los revendedores que acaparan en la apertura de venta. */
export const MAXIMO_ENTRADAS_POR_COMPRA = 10;

/**
 * Paso 3 del CU-001: *"El usuario elige el evento, localidad y cantidad de
 * entradas"*. El evento no se pide: se deduce de la localidad, y así no puede
 * llegar una combinación incoherente (localidad de un evento, id de otro).
 *
 * No hay ningún campo de precio: lo pone el servidor. Un cliente que mandara
 * `precio: 1` sería rechazado por el `forbidNonWhitelisted` de `main.ts`.
 */
export class CrearCompraDto {
  @ApiProperty({ format: 'uuid', example: '10000001-0000-4000-8000-000000000001' })
  @IsUUID()
  localidadId: string;

  @ApiProperty({ minimum: 1, maximum: MAXIMO_ENTRADAS_POR_COMPRA, example: 2 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAXIMO_ENTRADAS_POR_COMPRA)
  cantidad: number;
}

/** CU-004, paso 1: *"El usuario ingresa un código promocional durante el proceso de compra"*. */
export class AplicarCuponDto {
  @ApiProperty({ example: 'HEXA10', description: 'Sin distinguir mayúsculas' })
  @IsString()
  @Length(3, 40)
  @Matches(/^\s*[A-Za-z0-9_-]+\s*$/, { message: 'El código solo admite letras, números, guiones y guion bajo' })
  codigo: string;
}

export class EntradaEmitidaDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ example: 'TCK-2026-001000' }) numeroTicket: string;
  @ApiProperty({ description: 'Salida 1 del CU-001: el código QR de ingreso' }) codigoQr: string;
  @ApiProperty({ example: 'Palco VIP' }) localidadNombre: string;
  @ApiProperty({ enum: EstadoEntrada }) estado: EstadoEntrada;
  @ApiProperty({ description: 'Lo que se pagó por esta entrada, con el descuento repartido' }) precioPagado: number;
}

export class CompraDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty({ example: 'CMP-2026-000001' }) numeroCompra: string;
  @ApiProperty({ enum: EstadoCompra }) estado: EstadoCompra;
  @ApiProperty({ format: 'uuid' }) eventoId: string;
  @ApiProperty({ format: 'uuid' }) localidadId: string;
  @ApiProperty() cantidad: number;
  @ApiProperty() precioUnitario: number;
  @ApiProperty() subtotal: number;
  @ApiProperty({ description: 'Descuento del código promocional (CU-004)' }) descuento: number;
  @ApiProperty({ description: 'Lo que se cobra (paso 4 del CU-001)' }) total: number;
  @ApiProperty({ nullable: true, type: String }) codigoPromocional: string | null;
  @ApiProperty({ description: 'Hasta cuándo se mantiene la reserva sin pagar (CU-001B)' }) expiraEn: string;
  @ApiProperty({ nullable: true, type: String }) pagadaEn: string | null;
  @ApiProperty({ nullable: true, type: String, description: 'Último motivo de rechazo del pago' }) motivo: string | null;
  @ApiProperty({ type: [EntradaEmitidaDto], description: 'Vacío hasta que se paga' }) entradas: EntradaEmitidaDto[];
}

export function aCompraDto(compra: Compra, entradas: Entrada[] = []): CompraDto {
  return {
    id: compra.id,
    numeroCompra: compra.numeroCompra,
    estado: compra.estado,
    eventoId: compra.eventoId,
    localidadId: compra.localidadId,
    cantidad: compra.cantidad,
    precioUnitario: compra.precioUnitario,
    subtotal: compra.subtotal,
    descuento: compra.descuento,
    total: compra.total,
    codigoPromocional: compra.codigoPromocional,
    expiraEn: compra.expiraEn.toISOString(),
    pagadaEn: compra.pagadaEn?.toISOString() ?? null,
    motivo: compra.motivo,
    entradas: entradas.map((e) => ({
      id: e.id,
      numeroTicket: e.numeroTicket,
      codigoQr: e.codigoQr,
      localidadNombre: e.localidadNombre,
      estado: e.estado,
      precioPagado: e.precioOriginal,
    })),
  };
}
