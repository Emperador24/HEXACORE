import type { Transporter } from 'nodemailer';
import { cargarConfiguracion } from '../config/configuracion';
import { EnviadorHttp, EnviadorSmtp, ErrorPermanenteDeCorreo, crearEnviador } from './enviador-correo';

/** CU-027 paso 5 y CU-027E con un proveedor de correo real. */
describe('EnviadorCorreo', () => {
  const smtp = { host: 'smtp.gmail.com', puerto: 465, seguro: true, usuario: 'hexacore@gmail.com', contrasena: 'abcd', remitente: 'hexacore@gmail.com' };
  const correo = { para: 'ana@example.com', asunto: 'Verifica tu cuenta', texto: 'Hola' };
  const transporte = (sendMail: jest.Mock) => ({ sendMail }) as unknown as Transporter;

  describe('EnviadorSmtp', () => {
    it('envía con remitente "HEXACORE" y el texto tal cual', async () => {
      const sendMail = jest.fn().mockResolvedValue({ messageId: 'x' });
      await new EnviadorSmtp(smtp, transporte(sendMail)).enviar(correo);
      expect(sendMail).toHaveBeenCalledWith({
        from: { name: 'HEXACORE', address: 'hexacore@gmail.com' },
        to: 'ana@example.com',
        subject: 'Verifica tu cuenta',
        text: 'Hola',
      });
    });

    it('un 5xx del servidor (buzón inexistente) es definitivo', async () => {
      const sendMail = jest.fn().mockRejectedValue(Object.assign(new Error('550'), { responseCode: 550 }));
      await expect(new EnviadorSmtp(smtp, transporte(sendMail)).enviar(correo)).rejects.toBeInstanceOf(ErrorPermanenteDeCorreo);
    });

    it.each([
      ['un 4xx (servidor ocupado)', { responseCode: 421 }],
      ['un fallo de red', { code: 'ECONNECTION' }],
    ])('%s se reintenta', async (_caso, detalle) => {
      const sendMail = jest.fn().mockRejectedValue(Object.assign(new Error('x'), detalle));
      const promesa = new EnviadorSmtp(smtp, transporte(sendMail)).enviar(correo);
      await expect(promesa).rejects.toThrow();
      await expect(promesa).rejects.not.toBeInstanceOf(ErrorPermanenteDeCorreo);
    });

    it('una contraseña rechazada se reintenta y dice qué revisar', async () => {
      const sendMail = jest.fn().mockRejectedValue(Object.assign(new Error('535'), { code: 'EAUTH', responseCode: 535 }));
      const promesa = new EnviadorSmtp(smtp, transporte(sendMail)).enviar(correo);
      await expect(promesa).rejects.toThrow('contraseña de aplicación');
      await expect(promesa).rejects.not.toBeInstanceOf(ErrorPermanenteDeCorreo);
    });
  });

  describe('configuración', () => {
    const original = { ...process.env };
    afterEach(() => { process.env = { ...original }; });

    it('por defecto usa el buzón simulado', () => {
      delete process.env.CORREO_PROVEEDOR;
      expect(crearEnviador(cargarConfiguracion().correo)).toBeInstanceOf(EnviadorHttp);
    });

    it('con smtp usa Gmail en 465, acepta la contraseña con espacios y remite desde la cuenta', () => {
      Object.assign(process.env, { CORREO_PROVEEDOR: 'smtp', SMTP_USUARIO: 'hexacore@gmail.com', SMTP_CONTRASENA: 'abcd efgh ijkl mnop' });
      const { correo: c } = cargarConfiguracion();
      expect(c.smtp).toEqual({ host: 'smtp.gmail.com', puerto: 465, seguro: true, usuario: 'hexacore@gmail.com', contrasena: 'abcdefghijklmnop', remitente: 'hexacore@gmail.com' });
      expect(crearEnviador(c)).toBeInstanceOf(EnviadorSmtp);
    });

    it('con smtp y sin credenciales no arranca', () => {
      Object.assign(process.env, { CORREO_PROVEEDOR: 'smtp', SMTP_USUARIO: '', SMTP_CONTRASENA: '' });
      expect(() => cargarConfiguracion()).toThrow('SMTP_USUARIO y SMTP_CONTRASENA');
    });

    it('rechaza un proveedor desconocido', () => {
      process.env.CORREO_PROVEEDOR = 'carta';
      expect(() => cargarConfiguracion()).toThrow('CORREO_PROVEEDOR');
    });
  });
});
