import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import type { ConsumeMessage } from 'amqplib';
import { DataSource } from 'typeorm';
import { ConexionRabbitMq } from '../../../compartido/rabbitmq/conexion-rabbitmq.service';
import { CONEXION_OPERACION } from '../persistencia/conexion';
import { COLA_INGRESOS, MAXIMO_INTENTOS, declararTopologiaMonitoreo } from './topologia';

const ES_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface IngresoRegistrado {
  id: string;
  tipo: 'INGRESO_REGISTRADO';
  eventoId: string;
  puntoAcceso: string;
  escaneadoEn: string;
}

/**
 * Alimenta el panel (paso 2) con los ingresos que valida Acceso QR.
 *
 * Idempotente en la base: el id del ingreso es la clave, así que una
 * reentrega del broker no suma dos veces (a diferencia de la deduplicación en
 * memoria de logística, esta sobrevive a un reinicio). Un mensaje malformado
 * va directo a la DLQ; un fallo de base se reintenta hasta `MAXIMO_INTENTOS`.
 */
@Injectable()
export class ConsumidorIngresosMonitoreo implements OnModuleInit {
  private readonly log = new Logger(ConsumidorIngresosMonitoreo.name);
  private readonly intentos = new Map<string, number>();

  constructor(
    private readonly conexion: ConexionRabbitMq,
    @InjectDataSource(CONEXION_OPERACION) private readonly datos: DataSource,
  ) {}

  onModuleInit(): void {
    this.conexion.registrarTopologia(declararTopologiaMonitoreo);
    this.conexion.registrarAlReconectar(async () => {
      await this.conexion.consumir(COLA_INGRESOS, (m) => this.procesar(m));
      this.log.log(`Monitoreo suscrito a "${COLA_INGRESOS}".`);
    });
  }

  private async procesar(mensaje: ConsumeMessage | null): Promise<void> {
    const canal = this.conexion.obtenerCanal();
    if (!mensaje || !canal) return;
    let ingreso: IngresoRegistrado;
    try {
      ingreso = JSON.parse(mensaje.content.toString()) as IngresoRegistrado;
      if (!ES_UUID.test(ingreso.id) || !ES_UUID.test(ingreso.eventoId) || !ingreso.puntoAcceso || Number.isNaN(Date.parse(ingreso.escaneadoEn))) {
        throw new Error('campos inválidos');
      }
    } catch (error) {
      this.log.warn(`Ingreso descartado a la DLQ: ${(error as Error).message}`);
      canal.nack(mensaje, false, false);
      return;
    }
    try {
      await this.datos.transaction(async (m) => {
        await m.query(
          `INSERT INTO ingresos (id, evento_id, punto_acceso, escaneado_en) VALUES ($1, $2, $3, $4) ON CONFLICT (id) DO NOTHING`,
          [ingreso.id, ingreso.eventoId, ingreso.puntoAcceso.slice(0, 120), ingreso.escaneadoEn],
        );
        // El primer ingreso por una entrada la da de alta como punto de acceso.
        await m.query(`INSERT INTO puntos_acceso (evento_id, nombre) VALUES ($1, $2) ON CONFLICT DO NOTHING`, [ingreso.eventoId, ingreso.puntoAcceso.slice(0, 120)]);
      });
      this.intentos.delete(ingreso.id);
      canal.ack(mensaje);
    } catch (error) {
      const n = (this.intentos.get(ingreso.id) ?? 0) + 1;
      this.intentos.set(ingreso.id, n);
      const reencolar = n < MAXIMO_INTENTOS;
      if (!reencolar) this.intentos.delete(ingreso.id);
      this.log.warn(`Ingreso ${ingreso.id} sin guardar (intento ${n}/${MAXIMO_INTENTOS}): ${(error as Error).message}`);
      canal.nack(mensaje, false, reencolar);
    }
  }
}
