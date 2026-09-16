import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import type { CreateInvestmentRequest, Investment, SessionUser } from '@nksq/contracts';
import { CurrentUser } from '../../common/public.decorator';
import { asObject, optionalString, parseId, requireNumber, requireString } from '../../common/validation';
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
    const input = asObject(body);
    const request: CreateInvestmentRequest = {
      companyName: requireString(input, 'companyName', 'Company name'),
      sector: optionalString(input, 'sector', 'Sector', 100),
      geography: optionalString(input, 'geography', 'Geography', 100),
      fiscalYearEndMonth: requireNumber(input, 'fiscalYearEndMonth', 'Fiscal year end month', { integer: true, min: 1, max: 12 }),
      instrument: requireString(input, 'instrument', 'Instrument', { max: 100 }),
      dealLead: optionalString(input, 'dealLead', 'Deal lead', 100),
    };
    return this.portfolio.create(request, user);
  }
}
