import { Inject, Injectable, Logger, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { connect, ChannelModel, ConfirmChannel } from 'amqplib';
import { CONFIGURACION, ConfiguracionServicio } from '../../config/configuracion';
import { CLAVE_PEDIDO_CONFIRMADO, COLA_ESTABLECIMIENTOS, EXCHANGE_PEDIDOS } from './pedido-confirmado.evento';

/** Patrón de Reventa: canal confirm, topología durable y reconexión sin impedir el arranque. */
@Injectable()
export class ConexionRabbitMq implements OnModuleInit, OnApplicationShutdown {
  private readonly log = new Logger(ConexionRabbitMq.name);
  private conexion: ChannelModel | null = null;
  private canal: ConfirmChannel | null = null;
  private reintento: NodeJS.Timeout | null = null;
  private cerrando = false;

  constructor(@Inject(CONFIGURACION) private readonly config: ConfiguracionServicio) {}
  onModuleInit(): Promise<void> { return this.conectar(); }
  obtenerCanal(): ConfirmChannel | null { return this.canal; }

  private async conectar(): Promise<void> {
    if (this.cerrando) return;
    let conexion: ChannelModel | undefined;
    try {
      conexion = await connect(this.config.rabbitmq.url, { timeout: 2000 });
      if (this.cerrando) { await conexion.close(); return; }
      this.conexion = conexion;
      conexion.on('error', () => this.log.error('Error de conexión RabbitMQ de Pedidos'));
      conexion.on('close', () => {
        if (this.conexion !== conexion) return;
        this.canal = null;
        this.conexion = null;
        this.programarReintento();
      });
      const canal = await conexion.createConfirmChannel();
      canal.on('error', () => this.log.error('Error de canal RabbitMQ de Pedidos'));
      canal.on('close', () => {
        if (this.conexion !== conexion) return;
        this.canal = null;
        void conexion!.close().catch(() => undefined);
      });
      await canal.assertExchange(EXCHANGE_PEDIDOS, 'topic', { durable: true });
      await canal.assertQueue(COLA_ESTABLECIMIENTOS, { durable: true });
      await canal.bindQueue(COLA_ESTABLECIMIENTOS, EXCHANGE_PEDIDOS, CLAVE_PEDIDO_CONFIRMADO);
      if (this.conexion === conexion && !this.cerrando) this.canal = canal;
    } catch {
      this.canal = null;
      this.conexion = null;
      await conexion?.close().catch(() => undefined);
      this.log.error('RabbitMQ de Pedidos no disponible; los pedidos confirmados no se revierten');
      this.programarReintento();
    }
  }

  private programarReintento(): void {
    if (this.cerrando || this.reintento) return;
    // Reconecta el transporte para publicaciones futuras; NO reenvía eventos fallidos.
    this.reintento = setTimeout(() => { this.reintento = null; void this.conectar(); }, 5000);
    this.reintento.unref();
  }

  async onApplicationShutdown(): Promise<void> {
    this.cerrando = true;
    if (this.reintento) clearTimeout(this.reintento);
    try { await this.canal?.close(); } catch { /* Continuar cerrando la conexión. */ }
    try { await this.conexion?.close(); } catch { this.log.warn('Incidencia al cerrar RabbitMQ de Pedidos'); }
    this.canal = null;
    this.conexion = null;
  }
}
