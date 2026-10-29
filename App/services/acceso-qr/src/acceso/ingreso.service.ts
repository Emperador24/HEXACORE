import { HttpException, Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { createHash } from 'node:crypto';
import { DataSource } from 'typeorm';
import { EstadoEvento, EventoReferencia } from '../persistencia/entidades/evento-referencia.entity';
import { Ingreso, OrigenIngreso } from '../persistencia/entidades/ingreso.entity';
import { ClienteVentas, RespuestaVentas } from './cliente-ventas.service';
import { Contadores } from './contadores';
import {
  CacheQrDto,
  IngresoAutorizadoDto,
  ResultadoSincronizacionDto,
  SincronizacionDto,
  SincronizarIngresosDto,
  ValidarQrDto,
} from './dto/ingreso.dto';
import { AforoCompleto, QrInvalido, QrYaUtilizado } from './acceso.errors';

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
    private readonly ventas: ClienteVentas,
  ) {}

  async validar(personalId: string, datos: ValidarQrDto, tokenSesion: string): Promise<IngresoAutorizadoDto> {
    return this.registrar(personalId, {
      eventoId: datos.eventoId,
      codigoQr: datos.codigoQr.trim(),
      puntoAcceso: datos.puntoAcceso ?? null,
      origen: OrigenIngreso.EN_LINEA,
      escaneadoEn: new Date(),
    }, tokenSesion);
  }

  /**
   * CU-002E: los QR que podrían ingresar, para validar sin conexión.
   *
   * Se piden a Ventas, que es quien tiene las entradas. Vienen ya hasheados:
   * este servicio tampoco llega a conocer los códigos en claro.
   */
  async cache(eventoId: string, tokenSesion: string): Promise<CacheQrDto> {
    return {
      eventoId,
      generadaEn: new Date().toISOString(),
      validos: await this.ventas.qrValidos(eventoId, tokenSesion),
    };
  }

  /**
   * CU-002E: sube los ingresos hechos sin conexio
   *
   * Si un mismo QR es escaneado en dos puertas desconectadas
   * vuelve como conflicto para que el personal lo revise
   */
  async sincronizar(
    personalId: string,
    datos: SincronizarIngresosDto,
    tokenSesion: string,
  ): Promise<SincronizacionDto> {
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
        }, tokenSesion);
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

  /**
   * Registra un ingreso. **Es una Saga**, desde ADR-14.
   *
   * `Entrada` es de Ventas y los ingresos son de aquí, así que ya no hay una
   * transacción que abarque las dos cosas. El orden de los pasos no es
   * arbitrario: está elegido para que el fallo caro no pueda ocurrir.
   *
   * 1. **Aforo e ingreso, en una transacción local.** Suma uno al aforo con la
   *    condición `asistentes < aforo_maximo` y deja la fila de ingreso. Las dos
   *    son de este servicio, así que siguen siendo atómicas entre sí: no puede
   *    haber un ingreso sin su plaza de aforo.
   * 2. **Ventas gasta el QR.** El `UPDATE ... WHERE estado = VALIDA` sigue
   *    siendo la autoridad contra la doble entrada, solo que en otra base.
   * 3. **Si Ventas dice que no, se deshace el paso 1.**
   *
   * ## Por qué el aforo va antes y no después
   *
   * Al revés —gastar el QR primero y comprobar el aforo después— la
   * compensación sería **remota**: pedirle a Ventas que devuelva la entrada a
   * `VALIDA`. Si esa llamada falla, alguien se queda en la puerta con su
   * entrada gastada sin haber entrado.
   *
   * En este orden la compensación es **local**: devolver una plaza de aforo y
   * borrar una fila propia. Lo peor que puede pasar es que una plaza quede
   * tomada unos instantes por un código que no servía — y eso no deja a nadie
   * fuera.
   *
   * La compensación remota existe igual (`revertirUso`), pero solo para el
   * caso en que Ventas **sí** gastó el QR y el registro local falló después.
   */
  private async registrar(personalId: string, escaneo: Escaneo, tokenSesion: string): Promise<IngresoAutorizadoDto> {
    const evento = await this.fuenteDatos
      .getRepository(EventoReferencia)
      .findOne({ where: { eventoId: escaneo.eventoId } });
    if (!evento) throw new QrInvalido('el evento no existe');
    if (evento.estado === EstadoEvento.CANCELADO) throw new QrInvalido('el evento fue cancelado');

    // --- Paso 2 primero en el código, pero sin efecto todavía: se necesita el
    // id de la entrada para poder guardar el ingreso, y Ventas es quien lo
    // sabe. Se pide ANTES de tocar nada propio para no tener que compensar
    // cuando el código sencillamente no vale, que es el caso más común.
    const gastada = await this.ventas.marcarUsada(escaneo.codigoQr, escaneo.eventoId, tokenSesion);

    if (gastada.respuesta === RespuestaVentas.YA_UTILIZADA) throw await this.yaUtilizado(gastada.entradaId);
    if (gastada.respuesta === RespuestaVentas.ANULADA) throw new QrInvalido('la entrada fue anulada');
    if (gastada.respuesta === RespuestaVentas.EN_REVENTA) {
      throw new QrInvalido('la entrada está publicada en reventa; su dueño debe retirarla primero');
    }
    if (gastada.respuesta !== RespuestaVentas.OK) {
      if (gastada.respuesta === RespuestaVentas.SIN_RESPUESTA) {
        // No se sabe si quedó marcada. No se deja pasar: en una puerta el
        // error caro es dejar entrar a quien no debía.
        this.log.error(`Ventas no respondió al validar un QR de ${escaneo.eventoId}`);
        throw new QrInvalido('no se pudo comprobar la entrada; intente de nuevo');
      }
      throw new QrInvalido('el código no corresponde a una entrada de este evento');
    }

    const entradaId = gastada.entradaId as string;

    try {
      // --- Paso 1: aforo e ingreso, atómicos entre sí.
      return await this.fuenteDatos.transaction(async (tx) => {
        if (!(await this.contadores.sumarAsistente(tx, escaneo.eventoId))) {
          this.log.error(
            `ALERTA CU-002B: ${evento.nombre} llego a su aforo (${evento.aforoMaximo}) ` +
              `y la entrada ${gastada.numeroTicket} se quedo fuera`,
          );
          throw new AforoCompleto(evento.aforoMaximo ?? 0);
        }

        // El UNIQUE(entrada_id) es la segunda defensa contra la doble entrada,
        // y sigue aquí: si dos puertas llegaran a pasar el filtro de Ventas,
        // esta restricción rechaza el segundo registro.
        const ingreso = await tx.save(
          tx.create(Ingreso, {
            entradaId,
            eventoId: escaneo.eventoId,
            validadoPor: personalId,
            puntoAcceso: escaneo.puntoAcceso,
            origen: escaneo.origen,
            escaneadoEn: escaneo.escaneadoEn,
          }),
        );

        return {
          autorizado: true,
          mensaje: 'Ingreso autorizado',
          numeroTicket: gastada.numeroTicket ?? '',
          localidadNombre: gastada.localidadNombre ?? '',
          eventoNombre: evento.nombre,
          registradoEn: ingreso.registradoEn.toISOString(),
          asistentes: evento.asistentes + 1,
          aforoMaximo: evento.aforoMaximo,
        };
      });
    } catch (error) {
      // --- Paso 3: Ventas ya gastó el QR y aquí no se pudo registrar. Se
      // deshace allá, o esa persona se queda fuera con la entrada consumida.
      await this.ventas.revertirUso(entradaId, tokenSesion);
      throw error;
    }
  }

  // CU-002D  cuándo y por donde se entro
  private async yaUtilizado(entradaId: string | null): Promise<QrYaUtilizado> {
    // Se mira en la tabla propia: los ingresos son de este servicio. Ventas
    // solo dice "ya se usó" y de qué entrada; el cuándo y el dónde están aquí.
    const previo = entradaId
      ? await this.fuenteDatos.getRepository(Ingreso).findOne({ where: { entradaId } })
      : null;
    this.log.warn(`CU-002D: intento de reutilizar la entrada ${entradaId}`);
    return new QrYaUtilizado(previo?.escaneadoEn ?? null, previo?.puntoAcceso ?? null);
  }
}

// hash de comparacion sin conocer el codigo
export function hashQr(codigo: string): string {
  return createHash('sha256').update(codigo).digest('hex');
}
