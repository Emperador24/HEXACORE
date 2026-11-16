import { DataSource } from 'typeorm';
import { EstadoPuntoAcceso } from '../persistencia/entidades/punto-acceso.entity';
import { PanelService, PuntoConFlujo } from './panel.service';

/** Paso 4 de CU-019: las alertas que la e2e no arma porque necesitan personal y accesos a la vez. */
describe('PanelService · alertas', () => {
  const panel = new PanelService({} as DataSource, {} as never, {} as never, {} as never);
  const evaluar = (e: Record<string, unknown>) =>
    (panel as unknown as { evaluar(e: unknown): { tipo: string; sugerencia?: { texto?: string } }[] }).evaluar({
      porcentaje: 0.2, asistentes: 20, aforoMaximo: 100, puntos: [], zonas: [], enCurso: true, ...e,
    });
  const punto = (nombre: string, ultimos5: number, ultimos10 = ultimos5): PuntoConFlujo => ({
    nombre, estado: EstadoPuntoAcceso.HABILITADO, alternativa: null, total: ultimos10, ultimos5, ultimos10, ultimaHora: ultimos10, ultimoIngreso: null,
  });

  it('CU-019B sin personal sobrante: propone desviar al acceso menos cargado que sí registra', () => {
    const alertas = evaluar({ puntos: [punto('Norte', 80), punto('Sur', 4)] });
    const congestion = alertas.find((a) => a.tipo === 'CONGESTION')!;
    expect(congestion.sugerencia!.texto).toContain('desviar gente hacia «Sur»');
  });

  it('con el evento en curso avisa de las zonas con menos personal presente que el requerido', () => {
    const zonas = [
      { zonaId: 'z1', nombre: 'Gramilla', requeridos: 4, presentes: 1 },
      { zonaId: 'z2', nombre: 'Tribuna', requeridos: 2, presentes: 2 },
    ];
    expect(evaluar({ zonas }).filter((a) => a.tipo === 'PERSONAL_INSUFICIENTE')).toHaveLength(1);
    expect(evaluar({ zonas, enCurso: false }).filter((a) => a.tipo === 'PERSONAL_INSUFICIENTE')).toHaveLength(0);
  });
});
