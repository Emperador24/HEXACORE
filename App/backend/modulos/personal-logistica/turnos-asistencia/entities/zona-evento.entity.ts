import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

/**
 * CU-017 (Asignar personal operativo): una zona de un evento que necesita
 * cierta cantidad de personal con un rol específico. No hay todavía un
 * servicio de "Eventos" (ver `eventoId` como string suelto en `Turno`), así
 * que `eventoId` aquí es la misma referencia lógica sin FK física.
 */
@Entity('zonas_evento')
export class ZonaEvento {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  eventoId: string;

  @Column()
  nombre: string;

  @Column()
  rolRequerido: string;

  @Column('int')
  personalRequerido: number;
}
