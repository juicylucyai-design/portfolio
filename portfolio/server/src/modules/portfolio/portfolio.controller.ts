import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import type { Investment, SessionUser } from '@nksq/contracts';
import { CurrentUser } from '../../common/public.decorator';
import { parseId } from '../../common/validation';
import { parseCreateInvestment } from './portfolio.input';
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

  @Post()
  create(@Body() body: unknown, @CurrentUser() user: SessionUser): Promise<Investment> {
    return this.portfolio.create(parseCreateInvestment(body), user);
  }
}
