import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CuentasService } from './cuentas.service';
import { MensajeDto, RestablecerDto, SolicitarRecuperacionDto } from './dto/recuperacion.dto';
import { RecuperacionService } from './recuperacion.service';
import { RegistroAceptadoDto, RegistroDto } from './dto/registro.dto';
import { VerificacionCompletadaDto, VerificarDto } from './dto/verificacion.dto';

/**
 * Cuentas de usuario (CU-027).
 *
 * Recibe y delega; ninguna regla vive aquí. En producción se consume a través
 * del API Gateway (ADR-02), pero el registro y el login son necesariamente
 * públicos: son los únicos endpoints que no pueden exigir un token, porque
 * sirven para obtenerlo.
 */
@ApiTags('cuentas')
@Controller('cuentas')
export class CuentasController {
  constructor(
    private readonly cuentas: CuentasService,
    private readonly recuperacion: RecuperacionService,
  ) {}

  @Post('registro')
  // 202 y no 201: el registro se acepta, pero la cuenta todavía no sirve para
  // nada hasta que se verifique el correo (pasos 5-7). Un 201 "Created"
  // prometería un recurso utilizable, y además distinguiría el alta real del
  // caso en que el correo ya existía — que es justo lo que no debe notarse.
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Registrar una cuenta nueva',
    description:
      'Pasos 1-4 del CU-027: valida el correo y la fortaleza de la contraseña, comprueba que no ' +
      'esté registrada, cifra y crea la cuenta con rol Cliente.\n\n' +
      '**Responde lo mismo exista o no el correo.** El CU-027 prohíbe revelar si una dirección ' +
      'está registrada; si este endpoint dijera "ya existe", serviría para averiguar quién tiene ' +
      'cuenta probando correos.',
  })
  @ApiResponse({ status: 202, type: RegistroAceptadoDto, description: 'Registro aceptado' })
  @ApiResponse({ status: 400, description: 'El nombre o el correo no tienen un formato válido' })
  @ApiResponse({ status: 422, description: 'La contraseña no cumple la política de seguridad' })
  registrar(@Body() datos: RegistroDto): Promise<RegistroAceptadoDto> {
    return this.cuentas.registrar(datos);
  }

  @Post('verificar')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Confirmar la cuenta con el enlace del correo',
    description:
      'Pasos 6-7 del CU-027: valida el enlace, activa la cuenta y permite el inicio de sesión. ' +
      'El enlace es de un solo uso.\n\n' +
      'Es `POST` y no `GET` a propósito: un `GET` lo dispararían los previsualizadores de enlaces ' +
      'de algunos clientes de correo, que abren las URL antes de que nadie las pulse, y quemarían ' +
      'el enlace antes de llegar a su destinatario.',
  })
  @ApiResponse({ status: 200, type: VerificacionCompletadaDto })
  @ApiResponse({ status: 422, description: 'El enlace no es válido, ya se usó o caducó' })
  verificar(@Body() datos: VerificarDto): Promise<VerificacionCompletadaDto> {
    return this.cuentas.verificar(datos);
  }

  @Post('recuperacion')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Pedir un enlace para restablecer la contraseña',
    description:
      'CU-027A: envía un enlace de un solo uso que caduca en AUTH_RECUPERACION_MINUTOS.\n\n' +
      '**Responde lo mismo, y en el mismo tiempo, exista o no la cuenta**: el trabajo se hace ' +
      'después de responder. Pedir otro enlace invalida el anterior, y no se envía más de uno por ' +
      'minuto a la misma cuenta.',
  })
  @ApiResponse({ status: 202, type: MensajeDto })
  @ApiResponse({ status: 400, description: 'El correo no tiene un formato válido' })
  solicitarRecuperacion(@Body() datos: SolicitarRecuperacionDto): MensajeDto {
    return this.recuperacion.solicitar(datos);
  }

  @Post('restablecer')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Elegir una contraseña nueva con el enlace del correo',
    description:
      'CU-027A: quema el enlace, cambia la contraseña, cierra todas las sesiones, levanta el ' +
      'bloqueo de CU-027D y activa la cuenta si seguía sin verificar. Avisa por correo.',
  })
  @ApiResponse({ status: 200, type: MensajeDto })
  @ApiResponse({ status: 422, description: 'Enlace no válido o caducado, o contraseña débil' })
  restablecer(@Body() datos: RestablecerDto): Promise<MensajeDto> {
    return this.recuperacion.restablecer(datos);
  }
}
