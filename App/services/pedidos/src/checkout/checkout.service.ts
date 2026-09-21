import { BadRequestException, ConflictException, HttpException, Injectable, Logger, NotFoundException, ServiceUnavailableException, UnprocessableEntityException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, In } from 'typeorm';
import { EventoReferencia } from '../persistencia/entidades/evento-referencia.entity';
import { Establecimiento, EstadoEstablecimiento } from '../persistencia/entidades/establecimiento.entity';
import { Producto } from '../persistencia/entidades/producto.entity';
import { Pedido, EstadoPedido } from '../persistencia/entidades/pedido.entity';
import { DetallePedido } from '../persistencia/entidades/detalle-pedido.entity';
import { EstadoReservaInventario, ReservaInventario } from '../persistencia/entidades/reserva-inventario.entity';
import { ReservasService } from '../inventario/reservas.service';
import { CrearCheckoutDto } from './dto/crear-checkout.dto';
import { CheckoutDto } from './dto/checkout.dto';

/** Decisión temporal: CU-011D no fija duración. Los 120 s de Reventa son de otro dominio. */
export const CHECKOUT_DURACION_SEGUNDOS = 600;
const MAX_CENTAVOS = 999999999999n;

function centavos(precio: string): bigint {
  if (!/^\d+\.\d{2}$/.test(precio)) throw new ConflictException('Precio almacenado inválido');
  const valor = BigInt(precio.replace('.', ''));
  if (valor <= 0n || valor > MAX_CENTAVOS) throw new ConflictException('Precio almacenado inválido');
  return valor;
}

@Injectable()
export class CheckoutService {
  private readonly log = new Logger(CheckoutService.name);

  constructor(
    @InjectDataSource() private readonly fuenteDatos: DataSource,
    private readonly reservas: ReservasService,
  ) {}

  async crear(clienteId: string, datos: CrearCheckoutDto): Promise<CheckoutDto> {
    const ids = datos.productos.map((item) => item.productoId.toLowerCase());
    if (new Set(ids).size !== ids.length) throw new BadRequestException('No repitas productos en el pedido');

    // QueryRunner permite distinguir rollback confirmado de commit/rollback inciertos.
    const transaccion = this.fuenteDatos.createQueryRunner();
    let pedidoId: string | undefined;
    let establecimientoReservado: string | undefined;
    let reservaSolicitada = false;
    let reservaActiva = false;
    let commitIntentado = false;
    try {
      await transaccion.connect();
      await transaccion.startTransaction();
      const gestor = transaccion.manager;
      const evento = await gestor.findOne(EventoReferencia, { where: { eventoId: datos.eventoId } });
      if (!evento) throw new NotFoundException('No existe el evento');
      if (!evento.disponible) throw new ConflictException('El evento no está disponible');

      const establecimiento = await gestor.findOne(Establecimiento, { where: { id: datos.establecimientoId } });
      if (!establecimiento) throw new NotFoundException('No existe el establecimiento');
      if (establecimiento.eventoId !== datos.eventoId) throw new UnprocessableEntityException('El establecimiento no pertenece al evento');
      if (establecimiento.estado !== EstadoEstablecimiento.DISPONIBLE) {
        throw new ConflictException({ codigo: 'ESTABLECIMIENTO_NO_DISPONIBLE', estado: establecimiento.estado });
      }

      const productos = await gestor.find(Producto, { where: { id: In(ids) } });
      const porId = new Map(productos.map((producto) => [producto.id, producto]));
      let totalCentavos = 0n;
      const detalles = datos.productos.map((item) => {
        const producto = porId.get(item.productoId.toLowerCase());
        if (!producto) throw new NotFoundException({ codigo: 'PRODUCTO_NO_ENCONTRADO', productoId: item.productoId });
        if (producto.establecimientoId !== establecimiento.id) throw new UnprocessableEntityException('El producto no pertenece al establecimiento');
        if (!producto.activo) throw new ConflictException({ codigo: 'PRODUCTO_INACTIVO', productoId: producto.id });
        if (producto.cantidadInventario < item.cantidad) {
          throw new ConflictException({
            codigo: producto.cantidadInventario === 0 ? 'PRODUCTO_AGOTADO' : 'INVENTARIO_INSUFICIENTE',
            productoId: producto.id, cantidadSolicitada: item.cantidad, cantidadDisponible: producto.cantidadInventario,
          });
        }
        totalCentavos += centavos(producto.precio) * BigInt(item.cantidad);
        return { productoId: producto.id, nombreProducto: producto.nombre, precioUnitario: producto.precio, cantidad: item.cantidad };
      });
      if (totalCentavos > MAX_CENTAVOS) throw new UnprocessableEntityException('El total supera el máximo permitido');
      const total = `${totalCentavos / 100n}.${(totalCentavos % 100n).toString().padStart(2, '0')}`;
      const creadoEn = new Date();
      const expiraEn = new Date(creadoEn.getTime() + CHECKOUT_DURACION_SEGUNDOS * 1000);
      const pedido = await gestor.save(Pedido, gestor.create(Pedido, {
        clienteId, establecimientoId: establecimiento.id, estado: EstadoPedido.PENDIENTE_PAGO,
        total, moneda: 'COP', metodoEntrega: datos.metodoEntrega, creadoEn, expiraEn,
        codigoQr: null, motivoCancelacion: null, confirmadoEn: null, canceladoEn: null,
      }));
      await gestor.insert(DetallePedido, detalles.map((detalle) => ({ ...detalle, pedidoId: pedido.id })));
      await gestor.insert(ReservaInventario, { pedidoId: pedido.id, estado: EstadoReservaInventario.PREPARANDO });
      pedidoId = pedido.id;
      establecimientoReservado = pedido.establecimientoId;
      reservaSolicitada = true;
      // Redis debe estar preparado. No inicializar ni modificar el inventario físico aquí.
      const reserva = await this.reservas.reservar({
        pedidoId: pedido.id, establecimientoId: pedido.establecimientoId, expiraEn: pedido.expiraEn,
        productos: detalles.map(({ productoId, cantidad }) => ({ productoId, cantidad })),
      });
      reservaActiva = reserva.estado === 'ACTIVA';
      if (!reservaActiva || reserva.expiraEn.getTime() !== pedido.expiraEn.getTime()) {
        throw new ServiceUnavailableException({ codigo: 'RESERVA_CHECKOUT_INCONSISTENTE' });
      }
      const actualizacion = await gestor.update(ReservaInventario, { pedidoId: pedido.id }, { estado: EstadoReservaInventario.ACTIVA });
      if (actualizacion.affected !== 1) throw new ServiceUnavailableException({ codigo: 'RESERVA_PERSISTENCIA_INCONSISTENTE' });
      const respuesta: CheckoutDto = {
        id: pedido.id, establecimientoId: pedido.establecimientoId, estado: pedido.estado,
        total: pedido.total, moneda: pedido.moneda, metodoEntrega: pedido.metodoEntrega,
        creadoEn: pedido.creadoEn.toISOString(), expiraEn: pedido.expiraEn.toISOString(),
        codigoQr: null, inventarioReservado: true, detalles,
      };
      commitIntentado = true;
      await transaccion.commitTransaction();
      return respuesta;
    } catch (error) {
      const respuestaError = error instanceof HttpException ? error.getResponse() : undefined;
      const codigo = respuestaError && typeof respuestaError === 'object' && 'codigo' in respuestaError ? respuestaError.codigo : undefined;
      const rechazoSinReserva = ['INVENTARIO_INSUFICIENTE', 'INVENTARIO_NO_PREPARADO', 'VENCIMIENTO_INVALIDO'].includes(String(codigo));
      let rollbackConfirmado = false;
      if (transaccion.isTransactionActive) {
        try {
          await transaccion.rollbackTransaction();
          rollbackConfirmado = true;
        } catch {
          this.log.error(`CHECKOUT_ROLLBACK_INCIERTO pedido=${pedidoId ?? 'sin-asignar'}`);
        }
      }
      // Un ROLLBACK posterior a un COMMIT cuya respuesta se perdió no prueba que no hubo commit.
      if (reservaActiva && rollbackConfirmado && !commitIntentado) {
        try {
          await this.reservas.liberar(establecimientoReservado!, pedidoId!);
        } catch {
          this.log.error(`CHECKOUT_LIBERACION_PENDIENTE pedido=${pedidoId} establecimiento=${establecimientoReservado}`);
        }
      } else if (reservaSolicitada && !rechazoSinReserva) {
        // Registro operativo mínimo para revisión manual, sin cuerpos ni datos sensibles.
        this.log.warn(`CHECKOUT_REVISAR_RESERVA pedido=${pedidoId} establecimiento=${establecimientoReservado} commitIntentado=${commitIntentado}`);
      }
      throw error;
    } finally {
      try { await transaccion.release(); }
      catch { this.log.error(`CHECKOUT_CONEXION_NO_LIBERADA pedido=${pedidoId ?? 'sin-asignar'}`); }
    }
  }
}
