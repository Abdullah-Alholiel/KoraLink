import { Module, Global } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from './schema';

@Global()
@Module({
  providers: [
    {
      provide: 'DB_CONNECTION',
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const sslMode = config.get<string>('SSL_MODE', 'false');
        const ssl = sslMode === 'require' ? ('require' as const) : false;
        const client = postgres(config.getOrThrow<string>('DATABASE_URL'), {
          ssl,
        });
        return drizzle(client, { schema });
      },
    },
  ],
  exports: ['DB_CONNECTION'],
})
export class DatabaseModule {}
