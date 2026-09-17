import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import type { CarrySettings, CarryTerms, InvestmentCarry, SessionUser } from '@nksq/contracts';
import { CurrentUser } from '../../common/public.decorator';
import { parseId } from '../../common/validation';
import { CarryService } from './carry.service';
import { parseCarryTermsInput, parseHurdleRate } from './carry.input';

@Controller('carry')
export class CarryController {
  constructor(private readonly carry: CarryService) {}

  @Get('settings')
  settings(): Promise<CarrySettings> {
    return this.carry.settings();
  }

  @Post('settings')
  updateSettings(@Body() body: unknown): Promise<CarrySettings> {
    return this.carry.setHurdleRate(parseHurdleRate(body));
  }

  @Get('summary')
  summary(): Promise<InvestmentCarry[]> {
    return this.carry.summary();
  }

  @Get('investments/:id/terms')
  terms(@Param('id') id: string): Promise<CarryTerms> {
    return this.carry.termsForInvestment(parseId(id, 'Investment id'));
  }

  @Post('investments/:id/terms')
  saveTerms(@Param('id') id: string, @Body() body: unknown, @CurrentUser() user: SessionUser): Promise<CarryTerms> {
    return this.carry.saveTerms(parseId(id, 'Investment id'), parseCarryTermsInput(body), user);
  }
}
