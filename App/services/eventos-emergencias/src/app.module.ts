import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TurnosAsistenciaModule } from './logistica/turnos-asistencia/turnos-asistencia.module.js';
import { ENTIDADES, MIGRACIONES } from './persistencia/data-source.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        // Infraestructura compartida del equipo (App/infra/docker-compose.yml),
        // no una instancia propia de este servicio.
        host: config.get('DB_HOST', 'localhost'),
        port: config.get('DB_PORT', 5432),
        username: config.get('DB_USER', 'hexacore'),
        password: config.get('DB_PASSWORD', 'hexacore'),
        database: config.get('DB_NAME', 'eventos_emergencias'),
        entities: ENTIDADES,
        migrations: MIGRACIONES,
        migrationsTableName: 'migraciones',
        // Nunca true: ver justificación en src/persistencia/data-source.ts.
        synchronize: false,
        migrationsRun: false,
      }),
    }),
    TurnosAsistenciaModule,
  ],
})
export class AppModule {}
