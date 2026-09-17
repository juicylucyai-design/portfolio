import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import type { Position } from '@nksq/contracts';
import { parseId } from '../../common/validation';
import { parseClosingInput } from '../closing';
import { PerformanceService } from './performance.service';

@Controller()
export class PerformanceController {
  constructor(private readonly performance: PerformanceService) {}

  @Get('positions')
  positions(): Promise<Position[]> {
    return this.performance.positions();
  }

  @Get('investments/:id/position')
  position(@Param('id') id: string): Promise<Position> {
    return this.performance.position(parseId(id, 'Investment id'));
  }

  @Post('investments/:id/position/preview')
  @HttpCode(200)
  preview(@Param('id') id: string, @Body() body: unknown): Promise<Position> {
    return this.performance.previewWithClosing(parseId(id, 'Investment id'), parseClosingInput(body));
  }
}
