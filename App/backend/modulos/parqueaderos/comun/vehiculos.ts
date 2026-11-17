export const TIPOS_VEHICULO = ['AUTOMOVIL', 'MOTO', 'DISCAPACIDAD'] as const;
export type TipoVehiculo = (typeof TIPOS_VEHICULO)[number];

/**
 * CU-023, pasos 2-3: cada vehículo ocupa solo espacios de su tipo. Una moto no
 * toma un espacio de automóvil ni un automóvil uno de moto o de movilidad
 * reducida: si la zona no tiene espacios de ese tipo, no hay cupo y se sugiere
 * otra zona (CU-023A). El organizador cambia el tipo de cada espacio en el mapa.
 *
 * Antes una moto o un vehículo de movilidad reducida podían quedar en un
 * espacio de automóvil cuando no había de su tipo; la prueba con usuarios del
 * 17/11 lo marcó como error (una moto reservó D-01, de automóvil) y además hacía
 * que la disponibilidad mostrara el mismo número para los tres tipos.
 */
export const ESPACIOS_ADMITIDOS: Record<TipoVehiculo, TipoVehiculo[]> = {
  AUTOMOVIL: ['AUTOMOVIL'],
  MOTO: ['MOTO'],
  DISCAPACIDAD: ['DISCAPACIDAD'],
};

export function nombreTipo(tipo: TipoVehiculo) {
  return { AUTOMOVIL: 'automóviles', MOTO: 'motos', DISCAPACIDAD: 'vehículos de movilidad reducida' }[tipo];
}

/** Las placas se guardan en mayúsculas y sin separadores. */
export const normalizarPlaca = (placa: string) => placa.replace(/[-\s]/g, '').toUpperCase();

/**
 * CU-021: formato de la placa colombiana según el vehículo. Automóviles y
 * vehículos de movilidad reducida llevan placa de carro (`ABC123`); las motos,
 * la de moto (`ABC12D`). El servidor es quien decide; la disponibilidad publica
 * estos formatos para que los clientes avisen antes de enviar, sin copiar la regla.
 */
export const FORMATO_PLACA: Record<TipoVehiculo, { patron: RegExp; ejemplo: string; descripcion: string }> = {
  AUTOMOVIL: { patron: /^[A-Z]{3}[0-9]{3}$/, ejemplo: 'ABC123', descripcion: 'tres letras y tres números' },
  MOTO: { patron: /^[A-Z]{3}[0-9]{2}[A-Z]$/, ejemplo: 'ABC12D', descripcion: 'tres letras, dos números y una letra' },
  DISCAPACIDAD: { patron: /^[A-Z]{3}[0-9]{3}$/, ejemplo: 'ABC123', descripcion: 'tres letras y tres números' },
};

/** El motivo por el que la placa no sirve para ese vehículo, o `null` si sirve. Recibe la placa normalizada. */
export function errorPlaca(placa: string, tipo: TipoVehiculo): string | null {
  const formato = FORMATO_PLACA[tipo];
  return formato.patron.test(placa)
    ? null
    : `La placa ${placa} no es una placa de ${tipo === 'MOTO' ? 'moto' : 'carro'} colombiana: lleva ${formato.descripcion} (p. ej. ${formato.ejemplo}).`;
}
