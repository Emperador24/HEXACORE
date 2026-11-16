import { ENTORNO } from './entorno';

/** Llamadas directas al gateway para preparar datos; la demostración en sí va por los portales. */
export async function llamar<T = any>(token: string | null, metodo: string, ruta: string, cuerpo?: unknown): Promise<T> {
  const respuesta = await fetch(ENTORNO.api + ruta, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', 'X-Hexacore-Cliente': 'web', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
  const texto = await respuesta.text();
  if (!respuesta.ok) throw new Error(`${metodo} ${ruta} → ${respuesta.status} ${texto.slice(0, 300)}`);
  return (texto ? JSON.parse(texto) : null) as T;
}

export async function sesion(correo: string, contrasena = ENTORNO.contrasena): Promise<string> {
  return (await llamar<{ token: string }>(null, 'POST', '/sesiones', { email: correo, contrasena })).token;
}

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Registra una cuenta nueva y la verifica con el enlace que llega al buzón
 * simulado (CU-027). Cada corrida necesita una: una cuenta solo puede tener
 * una ficha de empleado, aunque se dé de baja.
 */
export async function cuentaNueva(nombre: string): Promise<string> {
  const email = `demo.empleado.${Date.now().toString(36)}@hexacore.test`;
  await llamar(null, 'POST', '/cuentas/registro', { nombre, email, contrasena: 'una frase de paso para la demo' });
  for (let intento = 0; intento < 30; intento++) {
    const r = await fetch(`${ENTORNO.buzon}?para=${encodeURIComponent(email)}`).catch(() => null);
    const correos = r?.ok ? ((await r.json()) as { correos: { texto?: string; html?: string }[] }).correos : [];
    const token = correos.map((c) => `${c.texto ?? ''} ${c.html ?? ''}`.match(/token=([A-Za-z0-9_-]+)/)?.[1]).find(Boolean);
    if (token) {
      await llamar(null, 'POST', '/cuentas/verificar', { token });
      return email;
    }
    await esperar(500);
  }
  throw new Error(`No llegó el correo de verificación de ${email} a ${ENTORNO.buzon}. Indica una cuenta verificada en DEMO_CUENTA_EMPLEADO.`);
}
