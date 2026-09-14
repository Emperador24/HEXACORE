import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TurnosAsistenciaModule } from './logistica/turnos-asistencia/turnos-asistencia.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get('DB_HOST', 'localhost'),
        port: config.get('DB_PORT', 5433),
        username: config.get('DB_USER', 'hexacore'),
        password: config.get('DB_PASSWORD', 'hexacore'),
        database: config.get('DB_NAME', 'eventos_emergencias'),
        autoLoadEntities: true,
        synchronize: config.get('DB_SYNCHRONIZE', 'true') === 'true',
      }),
    }),
    TurnosAsistenciaModule,
  ],
})
export class AppModule {}
