import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import type { IcCase, IcCaseSummary, IcProjection, SessionUser } from '@nksq/contracts';
import { CurrentUser } from '../../common/public.decorator';
import { parseId } from '../../common/validation';
import { parseIcCaseInput } from './ic-case.input';
import { IcCaseService } from './ic-case.service';

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
