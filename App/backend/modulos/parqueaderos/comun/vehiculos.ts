export const TIPOS_VEHICULO = ['AUTOMOVIL', 'MOTO', 'DISCAPACIDAD'] as const;
export type TipoVehiculo = (typeof TIPOS_VEHICULO)[number];

/**
 * CU-023, paso 3, reglas de prioridad por tipo de vehículo: en qué espacios
 * puede quedar cada uno, del preferido al último recurso. Un automóvil nunca
 * ocupa un espacio de moto ni uno de movilidad reducida.
 */
export const ESPACIOS_ADMITIDOS: Record<TipoVehiculo, TipoVehiculo[]> = {
  AUTOMOVIL: ['AUTOMOVIL'],
  MOTO: ['MOTO', 'AUTOMOVIL'],
  DISCAPACIDAD: ['DISCAPACIDAD', 'AUTOMOVIL'],
};

export function nombreTipo(tipo: TipoVehiculo) {
  return { AUTOMOVIL: 'automóviles', MOTO: 'motos', DISCAPACIDAD: 'vehículos de movilidad reducida' }[tipo];
}

/** Las placas se guardan en mayúsculas y sin separadores. */
export const normalizarPlaca = (placa: string) => placa.replace(/-/g, '').toUpperCase();
