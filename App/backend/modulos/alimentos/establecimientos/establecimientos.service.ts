import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, QueryFailedError } from 'typeorm';
import { ConsultaEventos } from '../../eventos-recintos/consulta-eventos.module';
import { ConsultaPersonal } from '../../identidad/consulta-personal.module';
import { CONEXION_ALIMENTOS } from '../persistencia/conexion';
import { Establecimiento, EstadoEstablecimiento } from '../persistencia/entidades/establecimiento.entity';
import { EventoReferencia } from '../persistencia/entidades/evento-referencia.entity';
import { PersonalEstablecimiento } from '../persistencia/entidades/personal-establecimiento.entity';
import { GuardarEstablecimientoDto } from './guardar-establecimiento.dto';
import { recibePedidos } from './horario';

@Injectable()
export class EstablecimientosService {
  constructor(@InjectDataSource(CONEXION_ALIMENTOS) private readonly datos: DataSource,
    private readonly eventos: ConsultaEventos, private readonly personal: ConsultaPersonal) {}

  private presentar(e: Establecimiento, eventoDisponible: boolean) {
    return { id: e.id, eventoId: e.eventoId, nombre: e.nombre, contacto: e.contacto,
      puntoEntrega: e.puntoEntrega, estado: e.estado, horaApertura: e.horaApertura.slice(0, 5),
      horaCierre: e.horaCierre.slice(0, 5), zonaHoraria: e.zonaHoraria,
      recibePedidos: eventoDisponible && recibePedidos(e) };
  }

  async listar(eventoId: string) {
    const evento = await this.eventos.paraAlimentos(eventoId);
    const locales = await this.datos.getRepository(Establecimiento).find({ where: { eventoId }, order: { nombre: 'ASC', id: 'ASC' } });
    return locales.map(e => this.presentar(e, evento.disponible));
  }

  async detalle(id: string) {
    const e = await this.exigir(id);
    const evento = await this.eventos.paraAlimentos(e.eventoId);
    return this.presentar(e, evento.disponible);
  }

  private async exigir(id: string) {
    const e = await this.datos.getRepository(Establecimiento).findOneBy({ id });
    if (!e) throw new NotFoundException('No existe el establecimiento');
    return e;
  }

  private validarZona(zona: string) {
    try { new Intl.DateTimeFormat('es', { timeZone: zona }).format(); }
    catch { throw new BadRequestException('Indica una zona horaria IANA válida, por ejemplo America/Bogota.'); }
  }

  async guardar(dto: GuardarEstablecimientoDto, id?: string) {
    this.validarZona(dto.zonaHoraria);
    const evento = await this.eventos.paraAlimentos(dto.eventoId);
    let local: Establecimiento;
    try {
      local = await this.datos.transaction(async m => {
        if (id) {
          const previo = await m.findOne(Establecimiento, { where: { id }, lock: { mode: 'pessimistic_write' } });
          if (!previo) throw new NotFoundException('No existe el establecimiento');
          if (previo.eventoId !== dto.eventoId) throw new ConflictException('El evento de un establecimiento registrado no se puede cambiar.');
        }
        // Referencia solo para conservar la FK histórica, validada contra su dueño.
        await m.upsert(EventoReferencia, { eventoId: evento.id, nombre: evento.nombre, disponible: evento.disponible }, ['eventoId']);
        return m.save(Establecimiento, m.create(Establecimiento, { ...dto, ...(id ? { id } : {}) }));
      });
    } catch (e) {
      if (e instanceof QueryFailedError && e.driverError.code === '23505' && e.driverError.constraint === 'uq_establecimiento_evento_nombre') {
        throw new ConflictException({ codigo: 'ESTABLECIMIENTO_DUPLICADO', mensaje: 'Este establecimiento ya está registrado en el evento. Abre su ficha para actualizarlo.' });
      }
      throw e;
    }
    return this.presentar(local, evento.disponible);
  }

  async cambiarEstado(id: string, estado: EstadoEstablecimiento) {
    // Mismo bloqueo que checkout: el cierre espera a pedidos ya admitidos.
    await this.datos.transaction(async m => {
      const e = await m.findOne(Establecimiento, { where: { id }, lock: { mode: 'pessimistic_write' } });
      if (!e) throw new NotFoundException('No existe el establecimiento');
      await m.update(Establecimiento, { id }, { estado });
    });
    return this.detalle(id);
  }

  async asignar(id: string, usuarioId: string, asignadoPor: string) {
    await this.exigir(id);
    if (!await this.personal.esPersonalActivo(usuarioId)) throw new BadRequestException('Selecciona una cuenta activa con rol Personal.');
    await this.datos.getRepository(PersonalEstablecimiento).upsert({ establecimientoId: id, usuarioId, asignadoPor }, ['establecimientoId', 'usuarioId']);
    return { establecimientoId: id, usuarioId };
  }

  async cuentasPersonal(busqueda: string) {
    if (typeof busqueda !== 'string' || busqueda.length > 100) throw new BadRequestException('La búsqueda debe ser texto de hasta 100 caracteres.');
    return this.personal.buscarActivos(busqueda.trim());
  }
  async personalAsignado(id: string) {
    await this.exigir(id);
    const vinculos = await this.datos.getRepository(PersonalEstablecimiento).find({ where: { establecimientoId: id } });
    const cuentas: { id: string; nombre: string; email: string; activo: boolean }[] = await this.personal.resumen(vinculos.map(v => v.usuarioId));
    return vinculos.map(v => ({ usuarioId: v.usuarioId, asignadoPor: v.asignadoPor,
      ...(cuentas.find(c => c.id === v.usuarioId) ?? { nombre: 'Cuenta no disponible', email: '', activo: false }) }));
  }
  async misEstablecimientos(usuarioId: string) {
    if (!await this.personal.esPersonalActivo(usuarioId)) throw new ForbiddenException('Necesitas una cuenta Personal activa.');
    const vinculos = await this.datos.getRepository(PersonalEstablecimiento).find({ where: { usuarioId } });
    if (!vinculos.length) return [];
    const locales = await this.datos.getRepository(Establecimiento).find({ where: vinculos.map(v => ({ id: v.establecimientoId })), order: { nombre: 'ASC', id: 'ASC' } });
    return locales.map(e => ({ id: e.id, eventoId: e.eventoId, nombre: e.nombre, estado: e.estado, puntoEntrega: e.puntoEntrega }));
  }

  async desvincular(id: string, usuarioId: string) {
    await this.exigir(id);
    await this.datos.getRepository(PersonalEstablecimiento).delete({ establecimientoId: id, usuarioId });
  }
}
