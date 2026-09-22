import { HttpException, Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { createHash } from 'node:crypto';
import { DataSource, EntityManager } from 'typeorm';
import { Entrada, EstadoEntrada } from '../persistencia/entidades/entrada.entity';
import { EstadoEvento, EventoReferencia } from '../persistencia/entidades/evento-referencia.entity';
import { Ingreso, OrigenIngreso } from '../persistencia/entidades/ingreso.entity';
import { Contadores } from './contadores';
import {
  CacheQrDto,
  IngresoAutorizadoDto,
  ResultadoSincronizacionDto,
  SincronizacionDto,
  SincronizarIngresosDto,
  ValidarQrDto,
} from './dto/ingreso.dto';
import { AforoCompleto, QrInvalido, QrYaUtilizado } from './venta.errors';

interface Escaneo {
  eventoId: string;
  codigoQr: string;
  puntoAcceso: string | null;
  origen: OrigenIngreso;
  escaneadoEn: Date;
}

/**
 * Validar QR CU-002
 * Un mismo QR no puede validar dos ingresos simultaneos
 * Lo que decide:
 * UPDATE entradas SET estado = 'USADA' WHERE estado = 'VALIDA'`: Postgres lo
 * ejecuta en una puerta y la otra ya no encuentra la fila en ese estado
 * 
 * la restricción `UNIQUE (entrada_id)` de `ingresos` rechaza el segundo registro.
 *
 *
 * Operar sin conexión CU-002E
 * El dispositivo descarga los QR validos del evento como **hashes**
 * valida contra ellos si pierde la red, y al volver sube lo que
 * escaneo, se mandan hashes y no los codigos
 * el telefono de la puerta no tiene codigos con los que entrar
 * Los codigos son de 96 bits aleatorios
 */
@Injectable()
export class IngresoService {
  private readonly log = new Logger(IngresoService.name);

  constructor(
    @InjectDataSource() private readonly fuenteDatos: DataSource,
    private readonly contadores: Contadores,
  ) {}

  async validar(personalId: string, datos: ValidarQrDto): Promise<IngresoAutorizadoDto> {
    return this.registrar(personalId, {
      eventoId: datos.eventoId,
      codigoQr: datos.codigoQr.trim(),
      puntoAcceso: datos.puntoAcceso ?? null,
      origen: OrigenIngreso.EN_LINEA,
      escaneadoEn: new Date(),
    });
  }

  // CU-002E: los QR que  podrian ingresar, para validar sin conexion
  async cache(eventoId: string): Promise<CacheQrDto> {
    const entradas = await this.fuenteDatos.manager.find(Entrada, {
      where: { eventoId, estado: EstadoEntrada.VALIDA },
      select: { codigoQr: true, numeroTicket: true, localidadNombre: true },
    });
    return {
      eventoId,
      generadaEn: new Date().toISOString(),
      validos: entradas.map((e) => ({
        hash: hashQr(e.codigoQr),
        numeroTicket: e.numeroTicket,
        localidadNombre: e.localidadNombre,
      })),
    };
  }

  /**
   * CU-002E: sube los ingresos hechos sin conexio
   *
   * Si un mismo QR es escaneado en dos puertas desconectadas
   * vuelve como conflicto para que el personal lo revise
   */
  async sincronizar(personalId: string, datos: SincronizarIngresosDto): Promise<SincronizacionDto> {
    const resultados: ResultadoSincronizacionDto[] = [];
    // Uno a uno y en orden, si el mismo QR aparece dos veces cuenta el primero
    const ordenados = [...datos.ingresos].sort((a, b) => a.escaneadoEn.localeCompare(b.escaneadoEn));
    for (const ingreso of ordenados) {
      try {
        await this.registrar(personalId, {
          eventoId: datos.eventoId,
          codigoQr: ingreso.codigoQr.trim(),
          puntoAcceso: ingreso.puntoAcceso ?? null,
          origen: OrigenIngreso.SINCRONIZADO,
          escaneadoEn: new Date(ingreso.escaneadoEn),
        });
        resultados.push({ codigoQr: ingreso.codigoQr, resultado: 'REGISTRADO', mensaje: 'Ingreso registrado' });
      } catch (error) {
        if (!(error instanceof HttpException)) throw error;
        const cuerpo = error.getResponse() as { codigo?: string; mensaje?: string };
        resultados.push({
          codigoQr: ingreso.codigoQr,
          resultado: cuerpo.codigo ?? 'ERROR',
          mensaje: cuerpo.mensaje ?? error.message,
        });
      }
    }
    const registrados = resultados.filter((r) => r.resultado === 'REGISTRADO').length;
    this.log.log(`Sincronización de ${datos.eventoId}: ${registrados} registrados, ${resultados.length - registrados} conflictos`);
    return { registrados, conflictos: resultados.length - registrados, resultados };
  }

  private async registrar(personalId: string, escaneo: Escaneo): Promise<IngresoAutorizadoDto> {
    return this.fuenteDatos.transaction(async (tx) => {
      const evento = await tx.findOne(EventoReferencia, { where: { eventoId: escaneo.eventoId } });
      if (!evento) throw new QrInvalido('el evento no existe');
      if (evento.estado === EstadoEvento.CANCELADO) throw new QrInvalido('el evento fue cancelado');

      //\valido para este evento
      const entrada = await tx.findOne(Entrada, { where: { codigoQr: escaneo.codigoQr } });
      if (entrada?.eventoId !== escaneo.eventoId) {
        throw new QrInvalido('el código no corresponde a una entrada de este evento');
      }
      // no usado CU-002D
      if (entrada.estado === EstadoEntrada.USADA) throw await this.yaUtilizado(tx, entrada.id);
      if (entrada.estado === EstadoEntrada.ANULADA) throw new QrInvalido('la entrada fue anulada');
      if (entrada.estado === EstadoEntrada.EN_REVENTA) {
        throw new QrInvalido('la entrada está publicada en reventa; su dueño debe retirarla primero');
      }

      // marcar el QR como usado
      const marcada = await tx.update(
        Entrada,
        { id: entrada.id, estado: EstadoEntrada.VALIDA },
        { estado: EstadoEntrada.USADA },
      );
      if (!marcada.affected) throw await this.yaUtilizado(tx, entrada.id);

      // suma uno al aforo, y falla si el aforo esta lleno CU-002B
      // al fallar se deshace todo y el QR no queda marcado como usado
      if (!(await this.contadores.sumarAsistente(tx, escaneo.eventoId))) {
        this.log.error(
          `ALERTA CU-002B: ${evento.nombre} llego a su aforo (${evento.aforoMaximo}) ` +
            `y la entrada ${entrada.numeroTicket} se quedo fuera`,
        );
        throw new AforoCompleto(evento.aforoMaximo ?? 0);
      }

      // hora de ingreso.
      const ingreso = await tx.save(
        tx.create(Ingreso, {
          entradaId: entrada.id,
          eventoId: escaneo.eventoId,
          validadoPor: personalId,
          puntoAcceso: escaneo.puntoAcceso,
          origen: escaneo.origen,
          escaneadoEn: escaneo.escaneadoEn,
        }),
      );

      //confirmación para el personal
      //si algo no cuadra el personal pide identificacion 
      return {
        autorizado: true,
        mensaje: 'Ingreso autorizado',
        numeroTicket: entrada.numeroTicket,
        localidadNombre: entrada.localidadNombre,
        eventoNombre: evento.nombre,
        registradoEn: ingreso.registradoEn.toISOString(),
        asistentes: evento.asistentes + 1,
        aforoMaximo: evento.aforoMaximo,
      };
    });
  }

  // CU-002D  cuándo y por donde se entro
  private async yaUtilizado(tx: EntityManager, entradaId: string): Promise<QrYaUtilizado> {
    const previo = await tx.findOne(Ingreso, { where: { entradaId } });
    this.log.warn(`CU-002D: intento de reutilizar la entrada ${entradaId}`);
    return new QrYaUtilizado(previo?.escaneadoEn ?? null, previo?.puntoAcceso ?? null);
  }
}

// hash de comparacion sin conocer el codigo
export function hashQr(codigo: string): string {
  return createHash('sha256').update(codigo).digest('hex');
}
