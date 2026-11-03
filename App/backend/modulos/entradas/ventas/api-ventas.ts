/** Contrato local publicado por Ventas: no expone entidades ni repositorios. */
export const API_VENTAS = 'API_LOCAL_VENTAS';
export interface ApiVentas {
  enviar<T>(
    ruta: string,
    token: string,
    cuerpo?: object,
  ): Promise<{ estadoHttp: number | null; cuerpo: T | null }>;
}
