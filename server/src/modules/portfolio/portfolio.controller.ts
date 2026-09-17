import { Body, Controller, Get, Param, Post, Put } from '@nestjs/common';
import type { Investment, SessionUser } from '@nksq/contracts';
import { CurrentUser } from '../../common/public.decorator';
import { parseId } from '../../common/validation';
import { parseBusinessSummary, parseCreateInvestment } from './portfolio.input';
import { PortfolioService } from './portfolio.service';

@Controller('investments')
export class PortfolioController {
  constructor(private readonly portfolio: PortfolioService) {}

  @Get()
  list(): Promise<Investment[]> {
    return this.portfolio.list();
  }

  @Get(':id')
  get(@Param('id') id: string): Promise<Investment> {
    return this.portfolio.get(parseId(id, 'Investment id'));
  }

  @Put(':id/summary')
  setSummary(@Param('id') id: string, @Body() body: unknown): Promise<Investment> {
    return this.portfolio.setBusinessSummary(parseId(id, 'Investment id'), parseBusinessSummary(body));
  }

  @Post()
  create(@Body() body: unknown, @CurrentUser() user: SessionUser): Promise<Investment> {
    return this.portfolio.create(parseCreateInvestment(body), user);
  }
}
