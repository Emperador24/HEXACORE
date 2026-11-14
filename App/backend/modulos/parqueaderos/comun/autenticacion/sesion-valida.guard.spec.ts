import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { generateKeyPairSync, randomUUID } from 'node:crypto';
import Redis from 'ioredis';
import { SesionValida } from './sesion-valida.guard';

describe('Validación reutilizada por SSE', () => {
  const claves = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const jwt = new JwtService({ privateKey: claves.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    publicKey: claves.publicKey.export({ type: 'spki', format: 'pem' }).toString(),
    signOptions: { algorithm: 'RS256', issuer: 'hexacore-administracion' }, verifyOptions: { algorithms: ['RS256'], issuer: 'hexacore-administracion' } });
  const contenido = { sub: randomUUID(), roles: ['Organizador'], jti: randomUUID() };
  let redis: { exists: jest.Mock }, guard: SesionValida;
  beforeEach(() => { redis = { exists: jest.fn().mockResolvedValue(0) }; guard = new SesionValida(jwt, new Reflector(), redis as unknown as Redis); });
  it('verifica criptografía real y Redis con el contrato existente', async () => {
    await expect(guard.validar(jwt.sign(contenido, { expiresIn: 900 }))).resolves.toMatchObject({ usuarioId: contenido.sub });
    expect(redis.exists).toHaveBeenCalledWith('sesion-revocada:' + contenido.jti);
  });
  it('rechaza el token firmado ya caducado, sin cambiar reloj', async () => {
    await expect(guard.validar(jwt.sign({ ...contenido, exp: Math.floor(Date.now() / 1000) - 1 }))).rejects.toMatchObject({ status: 401 });
    expect(redis.exists).not.toHaveBeenCalled();
  });
  it('rechaza la clave de revocación del contrato (doble Redis)', async () => {
    redis.exists.mockResolvedValue(1); await expect(guard.validar(jwt.sign(contenido, { expiresIn: 900 }))).rejects.toMatchObject({ status: 401 });
  });
  it('no acepta cuando Redis falla', async () => {
    redis.exists.mockRejectedValue(new Error('fallo simulado')); await expect(guard.validar(jwt.sign(contenido, { expiresIn: 900 }))).rejects.toMatchObject({ status: 503 });
  });
  it('vuelve a verificar después de Redis: doble explícito de caducidad durante la espera', async () => {
    const verificar = jest.fn().mockResolvedValueOnce(contenido).mockRejectedValueOnce(new Error('expired'));
    const g = new SesionValida({ verifyAsync: verificar } as unknown as JwtService, new Reflector(), redis as unknown as Redis);
    await expect(g.validar('fixture')).rejects.toMatchObject({ status: 401 }); expect(verificar).toHaveBeenCalledTimes(2);
  });
});
