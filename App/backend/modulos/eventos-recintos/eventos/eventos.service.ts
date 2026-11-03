import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, LessThan, MoreThan, Not } from 'typeorm';
import { CONEXION_EVENTOS } from '../persistencia/conexion';
import { EstadoEvento, Evento } from '../persistencia/entidades/evento.entity';
import { HistorialEvento } from '../persistencia/entidades/historial-evento.entity';
import { Localidad } from '../persistencia/entidades/localidad.entity';
import { Recinto } from '../persistencia/entidades/recinto.entity';
import { ZonaRecinto } from '../persistencia/entidades/zona-recinto.entity';
import { BandejaEventos } from './bandeja-eventos.service';
import { mensajeEvento } from './contrato';
import { GuardarEventoDto, LocalidadDto } from './dto/guardar-evento.dto';

const HORA = 3_600_000;
const DIA = 24 * HORA;

/** Lo que se compara para el historial: los campos que el organizador edita. */
const CAMPOS = ['nombre', 'descripcion', 'categoria', 'artista', 'imagenUrl', 'recintoId', 'fechaInicio', 'fechaFin', 'aforoMaximo', 'permiteReventa'] as const;

interface Horario { fechaInicio: Date; fechaFin: Date }

/** Lo que el organizador ve tras guardar: si el horario choca, con qué y qué alternativas hay (paso 5, CU-026C). */
export interface Disponibilidad {
  conflictos: { id: string; nombre: string; fechaInicio: Date; fechaFin: Date }[];
  sugerencias: { fechaInicio: Date; fechaFin: Date }[];
}

/**
 * CU-026: Gestión de eventos.
 *
 * Reglas que se aplican siempre en una transacción con la fila del recinto
 * bloqueada, para que dos organizadores no publiquen a la vez dos eventos
 * traslapados en el mismo espacio ni superen su capacidad:
 *
 * - Paso 4 / CU-026B: aforo máximo ≤ capacidad del recinto; suma de cupos ≤
 *   aforo máximo; suma de cupos de cada zona ≤ capacidad de la zona.
 * - Paso 5 / CU-026C: sin traslape con otro evento **publicado** del recinto.
 *   Un borrador no bloquea a nadie; al guardarlo se avisa, al publicarlo se
 *   rechaza, y en ambos casos se sugieren horarios libres.
 * - Paso 9: cada cambio sube `version` y deja una fila en el historial con la
 *   instantánea completa.
 * - Pasos 8 y CU-026D: publicar, editar lo publicado y cancelar dejan un
 *   mensaje en la bandeja de salida para Boletería (CONTRATO-EVENTOS.md).
 */
@Injectable()
export class EventosService {
  constructor(
    @InjectDataSource(CONEXION_EVENTOS) private readonly datos: DataSource,
    private readonly bandeja: BandejaEventos,
  ) {}

  // --- Consulta ---------------------------------------------------------------

  async listar(estado?: string) {
    if (estado && !Object.values(EstadoEvento).includes(estado as EstadoEvento)) {
      throw new BadRequestException('Estado de evento desconocido.');
    }
    const eventos = await this.datos.getRepository(Evento).find({
      where: estado ? { estado: estado as EstadoEvento } : {},
      relations: { localidades: true },
      order: { fechaInicio: 'ASC' },
    });
    const recintos = await this.recintosPorId(eventos.map((e) => e.recintoId));
    return eventos.map((e) => ({
      ...this.sinLocalidades(e),
      recinto: this.resumenRecinto(recintos.get(e.recintoId)),
      cupos: e.localidades.reduce((n, l) => n + l.cantidad, 0),
      tiposDeEntrada: e.localidades.length,
    }));
  }

  async detalle(id: string) {
    const evento = await this.datos.getRepository(Evento).findOne({ where: { id }, relations: { localidades: true } });
    if (!evento) throw new NotFoundException({ codigo: 'EVENTO_NO_ENCONTRADO', mensaje: 'El evento no existe.' });
    const [recinto, historial] = await Promise.all([
      this.datos.getRepository(Recinto).findOneBy({ id: evento.recintoId }),
      this.datos.getRepository(HistorialEvento).find({ where: { eventoId: id }, order: { version: 'DESC', fecha: 'DESC' }, take: 100 }),
    ]);
    evento.localidades.sort((a, b) => a.orden - b.orden);
    return { evento, recinto, historial };
  }

  /** Paso 5 antes de guardar: el portal lo consulta al cambiar fecha o recinto. */
  async disponibilidad(recintoId: string, inicio: string, fin: string, excluirEventoId?: string): Promise<Disponibilidad> {
    const horario = this.horario(inicio, fin);
    return this.consultarDisponibilidad(this.datos.manager, recintoId, horario, excluirEventoId);
  }

  // --- Crear y editar (pasos 1-5, 9 y CU-026A) --------------------------------

  async crear(dto: GuardarEventoDto, realizadoPor: string) {
    const horario = this.horario(dto.fechaInicio, dto.fechaFin);
    this.exigirFuturo(horario);
    const { id, disponibilidad } = await this.datos.transaction(async (m) => {
      const recinto = await this.bloquearRecinto(m, dto.recintoId);
      const aforoMaximo = dto.aforoMaximo ?? recinto.capacidad;
      this.validarAforo(recinto, aforoMaximo, dto.localidades);

      const evento = await m.save(
        m.create(Evento, {
          ...this.camposDe(dto),
          ...horario,
          aforoMaximo,
          estado: EstadoEvento.BORRADOR,
          version: 1,
          creadoPor: realizadoPor,
        }),
      );
      evento.localidades = await m.save(dto.localidades.map((l, i) => m.create(Localidad, this.localidadDe(l, evento.id, i))));
      await this.registrar(m, evento, 'CREADO', realizadoPor, null, {});
      return { id: evento.id, disponibilidad: await this.consultarDisponibilidad(m, recinto.id, horario, evento.id) };
    });
    return { ...(await this.detalle(id)), disponibilidad };
  }

  /**
   * Editar. Un evento publicado ya tiene entradas vendidas en Boletería, así
   * que en él no se cambia el recinto ni se quitan o reducen tipos de entrada:
   * se pueden añadir, ampliar y cambiar de precio (afecta a las ventas
   * siguientes). Lo cancelado no se edita.
   */
  async actualizar(id: string, dto: GuardarEventoDto, realizadoPor: string) {
    if (dto.version === undefined) throw new BadRequestException('Falta la versión del evento.');
    const horario = this.horario(dto.fechaInicio, dto.fechaFin);
    const disponibilidad = await this.datos.transaction(async (m) => {
      const evento = await this.bloquearEvento(m, id, dto.version!);
      if (evento.estado === EstadoEvento.CANCELADO) {
        throw new ConflictException({ codigo: 'EVENTO_CANCELADO', mensaje: 'Un evento cancelado no se puede editar.' });
      }
      const publicado = evento.estado === EstadoEvento.PUBLICADO;
      const antes = { ...evento };
      const localidadesAntes = await m.find(Localidad, { where: { eventoId: id } });

      if (publicado) {
        if (dto.recintoId !== evento.recintoId) {
          throw new ConflictException({ codigo: 'RECINTO_INMUTABLE', mensaje: 'El recinto de un evento publicado no se puede cambiar; cancélalo y crea otro.' });
        }
        for (const previa of localidadesAntes) {
          const nueva = dto.localidades.find((l) => l.id === previa.id);
          if (!nueva || nueva.cantidad < previa.cantidad) {
            throw new ConflictException({
              codigo: 'LOCALIDAD_PUBLICADA',
              mensaje: `«${previa.nombre}» ya está a la venta: se puede ampliar o cambiar de precio, pero no quitar ni reducir.`,
              localidadId: previa.id,
            });
          }
        }
        if (horario.fechaInicio.getTime() !== evento.fechaInicio.getTime()) this.exigirFuturo(horario);
      } else {
        this.exigirFuturo(horario);
      }

      const recinto = await this.bloquearRecinto(m, dto.recintoId);
      const aforoMaximo = dto.aforoMaximo ?? (dto.recintoId === evento.recintoId ? evento.aforoMaximo : recinto.capacidad);
      this.validarAforo(recinto, aforoMaximo, dto.localidades);

      const disponibilidad = await this.consultarDisponibilidad(m, recinto.id, horario, id);
      if (publicado && disponibilidad.conflictos.length > 0) this.rechazarTraslape(disponibilidad);

      Object.assign(evento, this.camposDe(dto), horario, { aforoMaximo, version: evento.version + 1, actualizadoEn: new Date() });
      await m.save(evento);

      const conservadas = new Set(dto.localidades.filter((l) => l.id).map((l) => l.id!));
      const desconocida = dto.localidades.find((l) => l.id && !localidadesAntes.some((p) => p.id === l.id));
      if (desconocida) throw new BadRequestException(`La localidad ${desconocida.id} no es de este evento.`);
      const quitadas = localidadesAntes.filter((p) => !conservadas.has(p.id));
      if (quitadas.length) await m.delete(Localidad, { id: In(quitadas.map((q) => q.id)) });
      evento.localidades = await m.save(dto.localidades.map((l, i) => m.create(Localidad, this.localidadDe(l, id, i))));

      await this.registrar(m, evento, 'EDITADO', realizadoPor, evento.estado, this.diferencias(antes, evento, localidadesAntes, evento.localidades));
      if (publicado) await this.bandeja.encolar(m, mensajeEvento('EVENTO_ACTUALIZADO', evento, recinto));
      return disponibilidad;
    });
    return { ...(await this.detalle(id)), disponibilidad };
  }

  // --- Publicar (pasos 6-10, CU-026B/C) ---------------------------------------

  async publicar(id: string, version: number, realizadoPor: string) {
    await this.datos.transaction(async (m) => {
      const evento = await this.bloquearEvento(m, id, version);
      if (evento.estado !== EstadoEvento.BORRADOR) {
        throw new ConflictException({ codigo: 'NO_ES_BORRADOR', mensaje: `Solo se publica un borrador (estado actual: ${evento.estado}).` });
      }
      evento.localidades = await m.find(Localidad, { where: { eventoId: id }, order: { orden: 'ASC' } });

      // Paso 7: completos y coherentes.
      const faltan: string[] = [];
      if (!evento.nombre?.trim()) faltan.push('nombre');
      if (!evento.categoria?.trim()) faltan.push('categoría');
      if (evento.localidades.length === 0) faltan.push('tipos de entrada');
      if (faltan.length) {
        throw new BadRequestException({ codigo: 'EVENTO_INCOMPLETO', mensaje: `Falta completar: ${faltan.join(', ')}.`, campos: faltan });
      }
      this.exigirFuturo(evento);

      const recinto = await this.bloquearRecinto(m, evento.recintoId);
      this.validarAforo(recinto, evento.aforoMaximo, evento.localidades);
      const disponibilidad = await this.consultarDisponibilidad(m, recinto.id, evento, id);
      if (disponibilidad.conflictos.length > 0) this.rechazarTraslape(disponibilidad);

      // Paso 8.
      evento.estado = EstadoEvento.PUBLICADO;
      evento.publicadoEn = new Date();
      evento.version += 1;
      evento.actualizadoEn = new Date();
      await m.save(evento);
      await this.registrar(m, evento, 'PUBLICADO', realizadoPor, EstadoEvento.BORRADOR, {});
      await this.bandeja.encolar(m, mensajeEvento('EVENTO_PUBLICADO', evento, recinto));
    });
    // Paso 10: la confirmación vuelve en la respuesta; el portal la muestra.
    return {
      ...(await this.detalle(id)),
      mensaje: 'Evento publicado. Queda a la vista en la cartelera cuando Boletería procese el mensaje de publicación.',
    };
  }

  // --- Cancelar y eliminar (CU-026D) -----------------------------------------

  async cancelar(id: string, version: number, motivo: string, realizadoPor: string) {
    let habiaPublicado = false;
    await this.datos.transaction(async (m) => {
      const evento = await this.bloquearEvento(m, id, version);
      if (evento.estado === EstadoEvento.CANCELADO) {
        throw new ConflictException({ codigo: 'YA_CANCELADO', mensaje: 'El evento ya está cancelado.' });
      }
      habiaPublicado = evento.estado === EstadoEvento.PUBLICADO;
      const anterior = evento.estado;
      evento.estado = EstadoEvento.CANCELADO;
      evento.canceladoEn = new Date();
      evento.motivoCancelacion = motivo.trim();
      evento.version += 1;
      evento.actualizadoEn = new Date();
      await m.save(evento);
      evento.localidades = await m.find(Localidad, { where: { eventoId: id } });
      await this.registrar(m, evento, 'CANCELADO', realizadoPor, anterior, { motivo: evento.motivoCancelacion });
      if (habiaPublicado) {
        // La devolución masiva (CU-003) la hace Ventas al recibir este mensaje.
        const recinto = await m.findOneByOrFail(Recinto, { id: evento.recintoId });
        await this.bandeja.encolar(m, mensajeEvento('EVENTO_CANCELADO', evento, recinto, true));
      }
    });
    return {
      ...(await this.detalle(id)),
      mensaje: habiaPublicado
        ? 'Evento cancelado. Boletería recibe la cancelación para retirarlo de la cartelera y devolver el dinero a los compradores (CU-003).'
        : 'Borrador cancelado. Nunca estuvo a la venta.',
    };
  }

  /** Un borrador nunca publicado se puede borrar; su historial se conserva. */
  async eliminar(id: string, version: number, realizadoPor: string) {
    await this.datos.transaction(async (m) => {
      const evento = await this.bloquearEvento(m, id, version);
      if (evento.estado !== EstadoEvento.BORRADOR || evento.publicadoEn) {
        throw new ConflictException({ codigo: 'NO_ELIMINABLE', mensaje: 'Solo se elimina un borrador que nunca se publicó; lo demás se cancela.' });
      }
      evento.localidades = await m.find(Localidad, { where: { eventoId: id } });
      await this.registrar(m, { ...evento, version: evento.version + 1 } as Evento, 'ELIMINADO', realizadoPor, EstadoEvento.BORRADOR, {}, null);
      await m.delete(Evento, { id });
    });
  }

  // --- Reglas -----------------------------------------------------------------

  /** Paso 4 y CU-026B. Señala la zona que se pasa. */
  private validarAforo(recinto: Recinto, aforoMaximo: number, localidades: { nombre: string; cantidad: number; zonaRecintoId?: string | null }[]) {
    if (aforoMaximo > recinto.capacidad) {
      throw new BadRequestException({
        codigo: 'AFORO_SUPERA_RECINTO',
        mensaje: `El aforo máximo (${aforoMaximo}) supera la capacidad de ${recinto.nombre} (${recinto.capacidad}).`,
        capacidad: recinto.capacidad,
      });
    }
    const nombres = new Set<string>();
    for (const l of localidades) {
      const clave = l.nombre.trim().toLowerCase();
      if (nombres.has(clave)) throw new BadRequestException({ codigo: 'LOCALIDAD_REPETIDA', mensaje: `Hay dos tipos de entrada llamados «${l.nombre.trim()}».` });
      nombres.add(clave);
    }
    const total = localidades.reduce((n, l) => n + l.cantidad, 0);
    if (total > aforoMaximo) {
      throw new BadRequestException({
        codigo: 'CUPOS_SUPERAN_AFORO',
        mensaje: `Los tipos de entrada suman ${total} cupos y el aforo máximo es ${aforoMaximo}.`,
        total,
        aforoMaximo,
      });
    }
    for (const zona of recinto.zonas ?? []) {
      const enZona = localidades.filter((l) => l.zonaRecintoId === zona.id).reduce((n, l) => n + l.cantidad, 0);
      if (enZona > zona.capacidad) {
        throw new BadRequestException({
          codigo: 'AFORO_SUPERA_ZONA',
          mensaje: `La zona «${zona.nombre}» admite ${zona.capacidad} personas y se le asignan ${enZona}.`,
          zona: { id: zona.id, nombre: zona.nombre, capacidad: zona.capacidad, asignado: enZona },
        });
      }
    }
    const ajena = localidades.find((l) => l.zonaRecintoId && !(recinto.zonas ?? []).some((z) => z.id === l.zonaRecintoId));
    if (ajena) throw new BadRequestException({ codigo: 'ZONA_AJENA', mensaje: `La zona de «${ajena.nombre}» no es de ${recinto.nombre}.` });
  }

  private rechazarTraslape(disponibilidad: Disponibilidad): never {
    const otro = disponibilidad.conflictos[0];
    throw new ConflictException({
      codigo: 'EVENTO_TRASLAPADO',
      mensaje: `El recinto ya tiene «${otro.nombre}» publicado en ese horario.`,
      ...disponibilidad,
    });
  }

  /**
   * Paso 5 y CU-026C. Las sugerencias son horarios con la misma duración: el
   * mismo a la misma hora de los días siguientes, y justo después de cada
   * evento con el que choca (con una hora para desmontar y montar).
   */
  private async consultarDisponibilidad(m: EntityManager, recintoId: string, horario: Horario, excluirEventoId?: string): Promise<Disponibilidad> {
    const publicados = (desde: Date, hasta: Date) =>
      m.find(Evento, {
        where: {
          recintoId,
          estado: EstadoEvento.PUBLICADO,
          fechaInicio: LessThan(hasta),
          fechaFin: MoreThan(desde),
          ...(excluirEventoId ? { id: Not(excluirEventoId) } : {}),
        },
        order: { fechaInicio: 'ASC' },
      });
    const conflictos = await publicados(horario.fechaInicio, horario.fechaFin);
    const resultado: Disponibilidad = {
      conflictos: conflictos.map((e) => ({ id: e.id, nombre: e.nombre, fechaInicio: e.fechaInicio, fechaFin: e.fechaFin })),
      sugerencias: [],
    };
    if (conflictos.length === 0) return resultado;

    const duracion = horario.fechaFin.getTime() - horario.fechaInicio.getTime();
    const ahora = Date.now();
    const candidatos = [
      ...conflictos.map((c) => Math.ceil((c.fechaFin.getTime() + HORA) / HORA) * HORA),
      ...Array.from({ length: 14 }, (_, k) => horario.fechaInicio.getTime() + (k + 1) * DIA),
    ].filter((t) => t > ahora).sort((a, b) => a - b);
    // Un solo rango para no consultar por candidato.
    const ocupados = await publicados(new Date(candidatos[0] ?? ahora), new Date((candidatos.at(-1) ?? ahora) + duracion));
    for (const inicio of candidatos) {
      const fin = inicio + duracion;
      if (ocupados.some((o) => o.fechaInicio.getTime() < fin && o.fechaFin.getTime() > inicio)) continue;
      if (resultado.sugerencias.some((s) => s.fechaInicio.getTime() === inicio)) continue;
      resultado.sugerencias.push({ fechaInicio: new Date(inicio), fechaFin: new Date(fin) });
      if (resultado.sugerencias.length === 3) break;
    }
    return resultado;
  }

  // --- Apoyo ------------------------------------------------------------------

  private horario(inicio: string, fin: string): Horario {
    const fechaInicio = new Date(inicio);
    const fechaFin = new Date(fin);
    if (Number.isNaN(fechaInicio.getTime()) || Number.isNaN(fechaFin.getTime())) {
      throw new BadRequestException('Indica fechaInicio y fechaFin en formato ISO 8601.');
    }
    if (fechaFin <= fechaInicio) {
      throw new BadRequestException({ codigo: 'HORARIO_INVALIDO', mensaje: 'El evento debe terminar después de empezar.' });
    }
    if (fechaFin.getTime() - fechaInicio.getTime() > 30 * DIA) {
      throw new BadRequestException({ codigo: 'HORARIO_INVALIDO', mensaje: 'Un evento no puede durar más de 30 días.' });
    }
    return { fechaInicio, fechaFin };
  }

  private exigirFuturo(horario: Horario) {
    if (horario.fechaInicio.getTime() <= Date.now()) {
      throw new BadRequestException({ codigo: 'FECHA_PASADA', mensaje: 'La fecha de inicio debe ser futura.' });
    }
  }

  /** La fila del recinto bloqueada serializa a quienes validan aforo y traslape en él. */
  private async bloquearRecinto(m: EntityManager, id: string): Promise<Recinto> {
    const recinto = await m.findOne(Recinto, { where: { id }, lock: { mode: 'pessimistic_write' }, loadEagerRelations: false });
    if (!recinto) throw new NotFoundException({ codigo: 'RECINTO_NO_ENCONTRADO', mensaje: 'El recinto no existe.' });
    if (!recinto.activo) throw new BadRequestException({ codigo: 'RECINTO_INACTIVO', mensaje: `${recinto.nombre} no está disponible.` });
    recinto.zonas = await m.find(ZonaRecinto, { where: { recintoId: id } });
    return recinto;
  }

  private async bloquearEvento(m: EntityManager, id: string, version: number): Promise<Evento> {
    const evento = await m.findOne(Evento, { where: { id }, lock: { mode: 'pessimistic_write' } });
    if (!evento) throw new NotFoundException({ codigo: 'EVENTO_NO_ENCONTRADO', mensaje: 'El evento no existe.' });
    if (evento.version !== version) {
      throw new ConflictException({
        codigo: 'VERSION_DESACTUALIZADA',
        mensaje: 'Otra persona modificó este evento mientras lo tenías abierto. Recarga para ver los cambios.',
        versionActual: evento.version,
      });
    }
    return evento;
  }

  private camposDe(dto: GuardarEventoDto) {
    return {
      nombre: dto.nombre.trim(),
      descripcion: dto.descripcion?.trim() || null,
      categoria: dto.categoria.trim(),
      artista: dto.artista?.trim() || null,
      imagenUrl: dto.imagenUrl?.trim() || null,
      recintoId: dto.recintoId,
      permiteReventa: dto.permiteReventa ?? true,
    };
  }

  private localidadDe(l: LocalidadDto, eventoId: string, orden: number): Partial<Localidad> {
    return {
      ...(l.id ? { id: l.id } : {}),
      eventoId,
      nombre: l.nombre.trim(),
      precio: l.precio,
      cantidad: l.cantidad,
      zonaRecintoId: l.zonaRecintoId ?? null,
      orden: orden + 1,
    };
  }

  /** Paso 9: una fila por cambio, con la instantánea del evento en esa versión. */
  private async registrar(
    m: EntityManager,
    evento: Evento,
    accion: string,
    realizadoPor: string,
    estadoAnterior: EstadoEvento | null,
    cambios: Record<string, unknown>,
    estadoNuevo: EstadoEvento | null = evento.estado,
  ) {
    await m.save(
      m.create(HistorialEvento, {
        eventoId: evento.id,
        version: evento.version,
        accion,
        estadoAnterior,
        estadoNuevo,
        realizadoPor,
        cambios,
        instantanea: { ...this.sinLocalidades(evento), localidades: (evento.localidades ?? []).map((l) => ({ ...l, evento: undefined })) },
      }),
    );
  }

  private diferencias(antes: Evento, despues: Evento, locAntes: Localidad[], locDespues: Localidad[]) {
    const cambios: Record<string, { antes: unknown; despues: unknown }> = {};
    for (const campo of CAMPOS) {
      const a = antes[campo] instanceof Date ? (antes[campo] as Date).toISOString() : antes[campo];
      const d = despues[campo] instanceof Date ? (despues[campo] as Date).toISOString() : despues[campo];
      if (a !== d) cambios[campo] = { antes: a, despues: d };
    }
    const resumen = (ls: Localidad[]) => ls.map((l) => `${l.nombre}: ${l.cantidad} × ${l.precio}`).sort().join(' | ');
    if (resumen(locAntes) !== resumen(locDespues)) cambios['localidades'] = { antes: resumen(locAntes), despues: resumen(locDespues) };
    return cambios;
  }

  private async recintosPorId(ids: string[]) {
    const recintos = ids.length ? await this.datos.getRepository(Recinto).find({ where: { id: In([...new Set(ids)]) } }) : [];
    return new Map(recintos.map((r) => [r.id, r]));
  }

  private resumenRecinto(r?: Recinto) {
    return r ? { id: r.id, nombre: r.nombre, ciudad: r.ciudad, capacidad: r.capacidad } : null;
  }

  private sinLocalidades(e: Evento) {
    const { localidades: _localidades, ...resto } = e;
    void _localidades;
    return resto;
  }
}
