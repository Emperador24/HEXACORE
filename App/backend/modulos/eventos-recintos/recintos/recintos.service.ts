import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, MoreThan, Not, QueryFailedError } from 'typeorm';
import { CONEXION_EVENTOS } from '../persistencia/conexion';
import { EstadoEvento, Evento } from '../persistencia/entidades/evento.entity';
import { Localidad } from '../persistencia/entidades/localidad.entity';
import { PlanoRecinto } from '../persistencia/entidades/plano-recinto.entity';
import { Recinto } from '../persistencia/entidades/recinto.entity';
import { ZonaRecinto } from '../persistencia/entidades/zona-recinto.entity';
import { GuardarRecintoDto, ZonaDto } from './dto/guardar-recinto.dto';

/** Tipos de plano aceptados. Sin SVG: es código y se serviría desde el mismo origen. */
export const TIPOS_PLANO = ['image/png', 'image/jpeg', 'image/webp'];
export const MAX_PLANO_BYTES = 1_500_000;

export interface ArchivoSubido { buffer: Buffer; mimetype: string; size: number }

type EventoAfectado = Pick<Evento, 'id' | 'nombre' | 'estado' | 'fechaInicio' | 'aforoMaximo'>;

/**
 * CU-029: Gestión de recintos y zonas.
 *
 * - Paso 4 / CU-029A: la suma de capacidades de las zonas no supera la
 *   capacidad total; el error dice cuánto suman y cuánto admite el recinto.
 * - CU-029B: si el recinto tiene eventos publicados que no han terminado, un
 *   cambio de capacidad, zonas o estado necesita confirmación explícita. Lo que
 *   dejaría vendido más de lo físico se rechaza aunque se confirme: capacidad
 *   menor que el aforo de un evento activo, o una zona más pequeña que los
 *   cupos ya puestos a la venta en ella.
 * - Se edita con la fila del recinto bloqueada, el mismo bloqueo que usa la
 *   publicación de eventos (CU-026): no se cruzan.
 */
@Injectable()
export class RecintosService {
  constructor(@InjectDataSource(CONEXION_EVENTOS) private readonly datos: DataSource) {}

  async listar(incluirInactivos: boolean) {
    const recintos = await this.datos.getRepository(Recinto).find({
      where: incluirInactivos ? {} : { activo: true },
      order: { ciudad: 'ASC', nombre: 'ASC' },
    });
    if (!incluirInactivos) return recintos;
    const ids = recintos.map((r) => r.id);
    const [uso, planos] = await Promise.all([
      ids.length
        ? this.datos.getRepository(Evento).createQueryBuilder('e')
            .select('e.recinto_id', 'recintoId')
            .addSelect(`count(*) FILTER (WHERE e.estado = 'PUBLICADO' AND e.fecha_fin > now())`, 'activos')
            .addSelect('count(*)', 'total')
            .where('e.recinto_id IN (:...ids)', { ids })
            .groupBy('e.recinto_id')
            .getRawMany<{ recintoId: string; activos: string; total: string }>()
        : [],
      this.datos.getRepository(PlanoRecinto).find({ select: { recintoId: true } }),
    ]);
    const porRecinto = new Map(uso.map((u) => [u.recintoId, u]));
    const conPlano = new Set(planos.map((p) => p.recintoId));
    return recintos.map((r) => ({
      ...r,
      eventosActivos: Number(porRecinto.get(r.id)?.activos ?? 0),
      eventosTotales: Number(porRecinto.get(r.id)?.total ?? 0),
      tienePlano: conPlano.has(r.id),
    }));
  }

  async detalle(id: string) {
    const recinto = await this.datos.getRepository(Recinto).findOneBy({ id });
    if (!recinto) throw new NotFoundException({ codigo: 'RECINTO_NO_ENCONTRADO', mensaje: 'El recinto no existe.' });
    const [eventos, plano] = await Promise.all([
      this.datos.getRepository(Evento).find({
        where: { recintoId: id, estado: Not(EstadoEvento.CANCELADO) },
        select: { id: true, nombre: true, estado: true, fechaInicio: true, fechaFin: true, aforoMaximo: true },
        order: { fechaInicio: 'ASC' },
      }),
      this.datos.getRepository(PlanoRecinto).findOne({ where: { recintoId: id }, select: { recintoId: true, tipo: true, tamano: true, actualizadoEn: true } }),
    ]);
    recinto.zonas.sort((a, b) => a.nombre.localeCompare(b.nombre));
    return { recinto, eventos, plano: plano ?? null };
  }

  // --- Registrar y editar (pasos 1-8, CU-029A/B) ----------------------------------

  async crear(dto: GuardarRecintoDto, realizadoPor: string) {
    this.validar(dto);
    const id = await this.conUnicidad(() =>
      this.datos.transaction(async (m) => {
        const recinto = await m.save(m.create(Recinto, { ...this.camposDe(dto), actualizadoPor: realizadoPor }));
        await m.save(dto.zonas.map((z) => m.create(ZonaRecinto, this.zonaDe(z, recinto.id))));
        return recinto.id;
      }),
    );
    return { ...(await this.detalle(id)), mensaje: 'Recinto registrado. Ya se puede elegir al crear un evento.' };
  }

  async actualizar(id: string, dto: GuardarRecintoDto, realizadoPor: string) {
    this.validar(dto);
    await this.conUnicidad(() =>
      this.datos.transaction(async (m) => {
        const recinto = await m.findOne(Recinto, { where: { id }, lock: { mode: 'pessimistic_write' }, loadEagerRelations: false });
        if (!recinto) throw new NotFoundException({ codigo: 'RECINTO_NO_ENCONTRADO', mensaje: 'El recinto no existe.' });
        const zonasAntes = await m.find(ZonaRecinto, { where: { recintoId: id } });
        const desconocida = dto.zonas.find((z) => z.id && !zonasAntes.some((a) => a.id === z.id));
        if (desconocida) throw new BadRequestException(`La zona ${desconocida.id} no es de este recinto.`);

        const quitadas = zonasAntes.filter((a) => !dto.zonas.some((z) => z.id === a.id));
        await this.comprobarImpacto(m, recinto, zonasAntes, quitadas, dto);

        Object.assign(recinto, this.camposDe(dto), { actualizadoPor: realizadoPor, actualizadoEn: new Date() });
        await m.save(recinto);
        if (quitadas.length) await m.delete(ZonaRecinto, { id: In(quitadas.map((q) => q.id)) });
        await m.save(dto.zonas.map((z) => m.create(ZonaRecinto, this.zonaDe(z, id))));
      }),
    );
    return { ...(await this.detalle(id)), mensaje: 'Cambios guardados.' };
  }

  /** Solo se borra un recinto que nunca tuvo eventos; si los tuvo, se desactiva. */
  async eliminar(id: string) {
    await this.datos.transaction(async (m) => {
      const recinto = await m.findOne(Recinto, { where: { id }, lock: { mode: 'pessimistic_write' }, loadEagerRelations: false });
      if (!recinto) throw new NotFoundException({ codigo: 'RECINTO_NO_ENCONTRADO', mensaje: 'El recinto no existe.' });
      const eventos = await m.count(Evento, { where: { recintoId: id } });
      if (eventos > 0) {
        throw new ConflictException({
          codigo: 'RECINTO_EN_USO',
          mensaje: `${recinto.nombre} tiene ${eventos} evento(s) asociados: desactívalo en vez de eliminarlo.`,
        });
      }
      await m.delete(Recinto, { id });
    });
  }

  // --- Plano (paso 5) ----------------------------------------------------------

  async subirPlano(id: string, archivo: ArchivoSubido | undefined) {
    if (!archivo) throw new BadRequestException({ codigo: 'PLANO_FALTANTE', mensaje: 'Adjunta una imagen del plano.' });
    if (!TIPOS_PLANO.includes(archivo.mimetype)) {
      throw new BadRequestException({ codigo: 'PLANO_TIPO', mensaje: 'El plano debe ser PNG, JPG o WebP.' });
    }
    if (archivo.size > MAX_PLANO_BYTES) {
      throw new BadRequestException({ codigo: 'PLANO_GRANDE', mensaje: 'El plano no puede pasar de 1,5 MB.' });
    }
    if (!this.firmaValida(archivo)) {
      throw new BadRequestException({ codigo: 'PLANO_TIPO', mensaje: 'El archivo no es la imagen que dice ser.' });
    }
    await this.buscar(id);
    await this.datos.getRepository(PlanoRecinto).save({ recintoId: id, tipo: archivo.mimetype, contenido: archivo.buffer, tamano: archivo.size, actualizadoEn: new Date() });
    return { tipo: archivo.mimetype, tamano: archivo.size };
  }

  async plano(id: string) {
    const plano = await this.datos.getRepository(PlanoRecinto).findOneBy({ recintoId: id });
    if (!plano) throw new NotFoundException({ codigo: 'SIN_PLANO', mensaje: 'Este recinto no tiene plano.' });
    return plano;
  }

  async quitarPlano(id: string) {
    await this.datos.getRepository(PlanoRecinto).delete({ recintoId: id });
  }

  // --- Reglas ------------------------------------------------------------------

  /** Paso 4 / CU-029A y coherencia de las zonas. */
  private validar(dto: GuardarRecintoDto) {
    const nombres = new Set<string>();
    for (const z of dto.zonas) {
      const clave = z.nombre.trim().toLowerCase();
      if (nombres.has(clave)) throw new BadRequestException({ codigo: 'ZONA_REPETIDA', mensaje: `Hay dos zonas llamadas «${z.nombre.trim()}».` });
      nombres.add(clave);
      const posicion = [z.x, z.y, z.ancho, z.alto];
      const definidas = posicion.filter((v) => v !== undefined && v !== null).length;
      if (definidas !== 0 && definidas !== 4) {
        throw new BadRequestException({ codigo: 'ZONA_POSICION', mensaje: `La posición de «${z.nombre}» en el plano está incompleta.` });
      }
      if (definidas === 4 && (z.x! + z.ancho! > 100.001 || z.y! + z.alto! > 100.001)) {
        throw new BadRequestException({ codigo: 'ZONA_POSICION', mensaje: `«${z.nombre}» se sale del plano.` });
      }
    }
    const suma = dto.zonas.reduce((n, z) => n + z.capacidad, 0);
    if (suma > dto.capacidad) {
      throw new BadRequestException({
        codigo: 'CAPACIDAD_ZONAS_EXCEDIDA',
        mensaje: `Las zonas suman ${suma} personas y el recinto admite ${dto.capacidad}.`,
        suma,
        capacidad: dto.capacidad,
      });
    }
  }

  /**
   * CU-029B. Bloquea lo que dejaría vendido más de lo físico y, para el resto
   * de cambios de capacidad con eventos activos, pide confirmación.
   */
  private async comprobarImpacto(m: EntityManager, recinto: Recinto, zonasAntes: ZonaRecinto[], quitadas: ZonaRecinto[], dto: GuardarRecintoDto) {
    // Una zona con tipos de entrada de cualquier evento no se borra (los vendidos apuntan a ella).
    if (quitadas.length) {
      const enUso = await m.find(Localidad, { where: { zonaRecintoId: In(quitadas.map((q) => q.id)) }, take: 1 });
      if (enUso.length) {
        const zona = quitadas.find((q) => q.id === enUso[0].zonaRecintoId)!;
        throw new ConflictException({ codigo: 'ZONA_EN_USO', mensaje: `La zona «${zona.nombre}» tiene tipos de entrada de eventos; no se puede quitar.`, zonaId: zona.id });
      }
    }

    const activos: EventoAfectado[] = await m.find(Evento, {
      where: { recintoId: recinto.id, estado: EstadoEvento.PUBLICADO, fechaFin: MoreThan(new Date()) },
      select: { id: true, nombre: true, estado: true, fechaInicio: true, aforoMaximo: true },
      order: { fechaInicio: 'ASC' },
    });
    if (activos.length === 0) return;

    const mayorAforo = activos.reduce((max, e) => (e.aforoMaximo > max.aforoMaximo ? e : max));
    if (dto.capacidad < mayorAforo.aforoMaximo) {
      throw new ConflictException({
        codigo: 'CAPACIDAD_COMPROMETIDA',
        mensaje: `«${mayorAforo.nombre}» está publicado con aforo ${mayorAforo.aforoMaximo}; la capacidad no puede bajar de ahí.`,
        eventos: activos,
      });
    }
    for (const z of dto.zonas.filter((z) => z.id)) {
      const vendible = await m.createQueryBuilder(Localidad, 'l')
        .innerJoin(Evento, 'e', 'e.id = l.evento_id')
        .select('e.nombre', 'evento')
        .addSelect('sum(l.cantidad)', 'cupos')
        .where('l.zona_recinto_id = :zona', { zona: z.id })
        .andWhere(`e.estado = 'PUBLICADO' AND e.fecha_fin > now()`)
        .groupBy('e.id').addGroupBy('e.nombre')
        .orderBy('sum(l.cantidad)', 'DESC')
        .limit(1)
        .getRawOne<{ evento: string; cupos: string }>();
      if (vendible && Number(vendible.cupos) > z.capacidad) {
        throw new ConflictException({
          codigo: 'ZONA_COMPROMETIDA',
          mensaje: `«${vendible.evento}» tiene ${vendible.cupos} cupos a la venta en «${z.nombre}»; la zona no puede bajar de ahí.`,
          zonaId: z.id,
        });
      }
    }

    const cambiaCapacidad =
      dto.capacidad !== recinto.capacidad ||
      (dto.activo ?? true) !== recinto.activo ||
      quitadas.length > 0 ||
      dto.zonas.some((z) => !z.id || zonasAntes.find((a) => a.id === z.id)?.capacidad !== z.capacidad);
    if (cambiaCapacidad && !dto.confirmarImpacto) {
      throw new ConflictException({
        codigo: 'CONFIRMAR_IMPACTO',
        mensaje: `${recinto.nombre} tiene ${activos.length} evento(s) publicados. El cambio puede afectar el aforo ya vendido.`,
        eventos: activos,
      });
    }
  }

  private camposDe(dto: GuardarRecintoDto) {
    return {
      nombre: dto.nombre.trim(),
      ciudad: dto.ciudad.trim(),
      direccion: dto.direccion?.trim() || null,
      capacidad: dto.capacidad,
      activo: dto.activo ?? true,
    };
  }

  private zonaDe(z: ZonaDto, recintoId: string): Partial<ZonaRecinto> {
    const dibujada = z.x !== undefined && z.x !== null;
    return {
      ...(z.id ? { id: z.id } : {}),
      recintoId,
      nombre: z.nombre.trim(),
      capacidad: z.capacidad,
      x: dibujada ? z.x! : null,
      y: dibujada ? z.y! : null,
      ancho: dibujada ? z.ancho! : null,
      alto: dibujada ? z.alto! : null,
      color: z.color ?? null,
    };
  }

  private async buscar(id: string) {
    const recinto = await this.datos.getRepository(Recinto).findOne({ where: { id }, loadEagerRelations: false });
    if (!recinto) throw new NotFoundException({ codigo: 'RECINTO_NO_ENCONTRADO', mensaje: 'El recinto no existe.' });
    return recinto;
  }

  /** Comprueba los primeros bytes: el tipo que declara el navegador se puede falsear. */
  private firmaValida({ buffer, mimetype }: ArchivoSubido): boolean {
    const b = buffer.subarray(0, 12);
    if (mimetype === 'image/png') return b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    if (mimetype === 'image/jpeg') return b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
    if (mimetype === 'image/webp') return b.subarray(0, 4).toString('ascii') === 'RIFF' && b.subarray(8, 12).toString('ascii') === 'WEBP';
    return false;
  }

  private async conUnicidad<T>(operacion: () => Promise<T>): Promise<T> {
    try {
      return await operacion();
    } catch (error) {
      const codigo = (error as QueryFailedError & { driverError?: { code?: string; constraint?: string } }).driverError;
      if (error instanceof QueryFailedError && codigo?.code === '23505') {
        const zona = codigo.constraint === 'UQ_zonas_recinto_nombre';
        throw new ConflictException({
          codigo: zona ? 'ZONA_REPETIDA' : 'RECINTO_DUPLICADO',
          mensaje: zona ? 'Hay dos zonas con el mismo nombre.' : 'Ya existe un recinto con ese nombre en esa ciudad.',
        });
      }
      throw error;
    }
  }
}
