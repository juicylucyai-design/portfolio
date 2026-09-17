import { BadRequestException, Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import type { Position } from '@nksq/contracts';
import { asObject, parseId } from '../../common/validation';
import { parseClosingInput } from '../closing';
import { PerformanceService } from './performance.service';

@Controller()
export class PerformanceController {
  constructor(private readonly performance: PerformanceService) {}

  @Get('positions')
  positions(): Promise<Position[]> {
    return this.performance.positions();
  }

  @Get('positions/portfolio-summary')
  portfolioSummary(): Promise<{ moic: number | null; irr: number | null }> {
    return this.performance.portfolioMoicAndIrr();
  }

  @Get('investments/:id/position')
  position(@Param('id') id: string): Promise<Position> {
    return this.performance.position(parseId(id, 'Investment id'));
  }

  @Post('investments/:id/position/preview')
  @HttpCode(200)
  preview(@Param('id') id: string, @Body() body: unknown): Promise<Position> {
    const input = asObject(body);
    const rawClosings = input.closings;
    if (!Array.isArray(rawClosings) || rawClosings.length === 0) throw new BadRequestException('Provide at least one closing to preview.');
    return this.performance.previewWithClosings(parseId(id, 'Investment id'), rawClosings.map((c) => parseClosingInput(c)));
  }
}
