import { Controller, Get, Param } from '@nestjs/common';
import type { FinancialActual, YearComparison } from '@nksq/contracts';
import { parseId } from '../../common/validation';
import { FinancialActualService } from './financial-actual.service';

// Recording and deleting financial actuals go through the Lifecycle module, because they also save documents.
@Controller()
export class FinancialActualController {
  constructor(private readonly financialActuals: FinancialActualService) {}

  @Get('investments/:id/financial-actuals')
  list(@Param('id') id: string): Promise<FinancialActual[]> {
    return this.financialActuals.listForInvestment(parseId(id, 'Investment id'));
  }

  @Get('investments/:id/financial-comparison')
  comparison(@Param('id') id: string): Promise<YearComparison[]> {
    return this.financialActuals.comparison(parseId(id, 'Investment id'));
  }
}
