import { BadRequestException, Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import type { IcCase, IcCaseInput, IcCaseSummary, IcProjection, IcTrancheInput, SessionUser } from '@nksq/contracts';
import { CurrentUser } from '../../common/public.decorator';
import {
  asObject,
  optionalString,
  parseId,
  requireArray,
  requireDate,
  requireNumber,
} from '../../common/validation';
import { IcCaseService } from './ic-case.service';

const MAX_TRANCHES = 20;

function parseIcCaseInput(body: unknown): IcCaseInput {
  const input = asObject(body);
  const trancheInputs = requireArray(input, 'tranches', 'tranche');
  if (trancheInputs.length > MAX_TRANCHES) throw new BadRequestException(`An IC case can have at most ${MAX_TRANCHES} tranches.`);

  const tranches: IcTrancheInput[] = trancheInputs.map((raw, index) => {
    const tranche = asObject(raw, `Tranche ${index + 1}`);
    return {
      amountUsd: requireNumber(tranche, 'amountUsd', `Tranche ${index + 1} amount`, { greaterThan: 0 }),
      expectedDate: requireDate(tranche, 'expectedDate', `Tranche ${index + 1} expected date`),
      milestone: optionalString(tranche, 'milestone', `Tranche ${index + 1} milestone`, 300),
    };
  });

  return {
    approvedOn: requireDate(input, 'approvedOn', 'IC approval date'),
    entryPostMoneyUsd: requireNumber(input, 'entryPostMoneyUsd', 'Entry post-money valuation', { greaterThan: 0 }),
    entryOwnershipPct: requireNumber(input, 'entryOwnershipPct', 'Entry ownership', { greaterThan: 0, max: 100 }),
    dilutionToExitPct: requireNumber(input, 'dilutionToExitPct', 'Dilution to exit', { min: 0, lessThan: 100 }),
    exitYear: requireNumber(input, 'exitYear', 'Exit year', { integer: true, min: 1990, max: 2200 }),
    exitValuationUsd: requireNumber(input, 'exitValuationUsd', 'Exit valuation', { min: 0 }),
    notes: optionalString(input, 'notes', 'Notes', 4000),
    tranches,
  };
}

@Controller()
export class IcCaseController {
  constructor(private readonly icCases: IcCaseService) {}

  @Get('investments/:id/ic-cases')
  list(@Param('id') id: string): Promise<IcCase[]> {
    return this.icCases.listForInvestment(parseId(id, 'Investment id'));
  }

  @Post('investments/:id/ic-cases')
  record(@Param('id') id: string, @Body() body: unknown, @CurrentUser() user: SessionUser): Promise<IcCase> {
    return this.icCases.recordApproval(parseId(id, 'Investment id'), parseIcCaseInput(body), user);
  }

  @Get('ic-cases/latest')
  latest(): Promise<IcCaseSummary[]> {
    return this.icCases.latestSummaries();
  }

  @Post('ic-cases/preview')
  @HttpCode(200)
  preview(@Body() body: unknown): IcProjection {
    return this.icCases.preview(parseIcCaseInput(body));
  }
}
