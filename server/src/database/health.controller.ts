import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { Public } from '../common/public.decorator';
import { Db } from './db';

@Controller('health')
export class HealthController {
  constructor(private readonly db: Db) {}

  @Public()
  @Get()
  async check(): Promise<{ status: 'ok' }> {
    try {
      await this.db.query('SELECT 1');
      return { status: 'ok' };
    } catch {
      throw new ServiceUnavailableException('Database is not reachable.');
    }
  }
}
