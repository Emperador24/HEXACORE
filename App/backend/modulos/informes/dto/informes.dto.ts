import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsISO8601, IsOptional, IsString, Length } from 'class-validator';

/** Entradas del CU-032: rango de fechas a consultar (ambos extremos opcionales). */
export class ConsultarDashboardDto {
  @ApiPropertyOptional({ example: '2026-01-01T00:00:00.000Z' })
  @IsOptional()
  @IsISO8601()
  desde?: string;

  @ApiPropertyOptional({ example: '2026-12-31T23:59:59.000Z' })
  @IsOptional()
  @IsISO8601()
  hasta?: string;
}

/** CU-032B: comparativo entre varios eventos, por sus identificadores separados por coma. */
export class CompararEventosDto extends ConsultarDashboardDto {
  @ApiPropertyOptional({ example: 'id-evento-1,id-evento-2' })
  @IsString()
  @Length(1, 2000)
  eventos: string;
}

/** Pasos 7-8: exportable. */
export class ExportarInformeDto extends ConsultarDashboardDto {
  @ApiPropertyOptional({ enum: ['csv', 'json'], default: 'csv' })
  @IsOptional()
  @IsIn(['csv', 'json'])
  formato?: 'csv' | 'json';
}
