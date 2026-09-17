import { Global, Module } from '@nestjs/common';
import { Db } from './db';
import { HealthController } from './health.controller';

@Global()
@Module({
  providers: [Db],
  exports: [Db],
  controllers: [HealthController],
})
export class DatabaseModule {}
