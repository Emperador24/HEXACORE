import { DataSource } from 'typeorm';
import { EventoReferencia } from '../persistencia/entidades/evento-referencia.entity';
import { Establecimiento } from '../persistencia/entidades/establecimiento.entity';
import { Pedido, EstadoPedido } from '../persistencia/entidades/pedido.entity';
import { EstadoReservaInventario, ReservaInventario } from '../persistencia/entidades/reserva-inventario.entity';

// Construir metadatos no abre conexiones ni ejecuta migraciones.
it('mapea la reserva con PK/FK compartida, RESTRICT y estados propios sin ampliar Pedido', async () => {
  const fuente = new DataSource({ type: 'postgres', entities: [EventoReferencia, Establecimiento, Pedido, ReservaInventario] });
  await (fuente as unknown as { buildMetadatas(): Promise<void> }).buildMetadatas();
  const metadata = fuente.getMetadata(ReservaInventario);
  expect(metadata.tableName).toBe('reservas_inventario');
  expect(metadata.primaryColumns.map((columna) => columna.databaseName)).toEqual(['pedido_id']);
  expect(metadata.primaryColumns[0].isGenerated).toBe(false);
  expect(metadata.foreignKeys).toHaveLength(1);
  expect(metadata.foreignKeys[0]).toMatchObject({ name: 'fk_reservas_inventario_pedido', onDelete: 'RESTRICT', columnNames: ['pedido_id'], referencedColumnNames: ['id'] });
  expect(metadata.columns.find((columna) => columna.propertyName === 'estado')).toMatchObject({ enum: Object.values(EstadoReservaInventario), default: EstadoReservaInventario.PREPARANDO });
  expect(metadata.createDateColumn?.databaseName).toBe('creada_en');
  expect(metadata.updateDateColumn?.databaseName).toBe('actualizada_en');
  expect(Object.values(EstadoPedido)).toEqual(['PENDIENTE_PAGO', 'CONFIRMADO', 'EXPIRADO', 'CANCELADO']);
});
