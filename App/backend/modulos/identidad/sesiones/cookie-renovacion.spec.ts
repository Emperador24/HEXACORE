import { escribirCookieRenovacion, borrarCookieRenovacion } from './cookie-renovacion';
import { Response } from 'express';
describe('RNF-06 contrato cookie web', () => {
  it.each([true, false])('Secure=%s depende del entorno, con HttpOnly/Strict/ruta acotada', segura => {
    const cookie = jest.fn(), clearCookie = jest.fn();
    const r = { cookie, clearCookie } as unknown as Response;
    const ruta = '/api/v1/sesiones', fecha = new Date();
    escribirCookieRenovacion(r, 'sintetico', fecha, { segura, ruta });
    expect(cookie).toHaveBeenCalledWith('hxc_renovacion', 'sintetico', { httpOnly: true, secure: segura, sameSite: 'strict', path: ruta, expires: fecha });
    borrarCookieRenovacion(r, { segura, ruta });
    expect(clearCookie).toHaveBeenCalledWith('hxc_renovacion', { httpOnly: true, secure: segura, sameSite: 'strict', path: ruta });
  });
});
