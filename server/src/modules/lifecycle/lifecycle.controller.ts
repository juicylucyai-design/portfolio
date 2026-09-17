import { BadRequestException, Body, Controller, Delete, HttpCode, Param, Post } from '@nestjs/common';
import type {
  CreateFromIcMemoResponse,
  DeleteInvestmentResult,
  InvestmentStatus,
  SaveCapitalEventResponse,
  SaveClosingsResponse,
  SaveFinancialActualResponse,
  SessionUser,
} from '@nksq/contracts';
import { CurrentUser } from '../../common/public.decorator';
import { asObject, parseId, requireNumber, requireString } from '../../common/validation';
import { parseCapitalEventInput } from '../capital-event';
import { parseClosingInput } from '../closing';
import { parseFinancialActualInput } from '../financial-actual';
import { parseIcCaseInput } from '../ic-case';
import { parseCreateInvestment } from '../portfolio';
import { LifecycleService } from './lifecycle.service';

@Controller()
export class LifecycleController {
  constructor(private readonly lifecycle: LifecycleService) {}

  @Post('investments/from-ic-memo')
  createFromIcMemo(@Body() body: unknown, @CurrentUser() user: SessionUser): Promise<CreateFromIcMemoResponse> {
    const input = asObject(body);
    return this.lifecycle.createFromIcMemo(
      {
        documentId: requireNumber(input, 'documentId', 'IC memo', { integer: true, min: 1 }),
        investment: parseCreateInvestment(input.investment),
        icCase: input.icCase === null || input.icCase === undefined ? null : parseIcCaseInput(input.icCase),
      },
      user,
    );
  }

  @Post('investments/:id/closings')
  saveClosings(@Param('id') id: string, @Body() body: unknown, @CurrentUser() user: SessionUser): Promise<SaveClosingsResponse> {
    const input = asObject(body);
    const documentId = input.documentId === null || input.documentId === undefined ? null : requireNumber(input, 'documentId', 'Closing document', { integer: true, min: 1 });
    const rawClosings = input.closings;
    if (!Array.isArray(rawClosings) || rawClosings.length === 0) throw new BadRequestException('Provide at least one closing.');
    return this.lifecycle.saveClosings(parseId(id, 'Investment id'), { documentId, closings: rawClosings.map((c) => parseClosingInput(c)) }, user);
  }

  @Delete('investments/:id/closings/:closingId')
  deleteClosing(
    @Param('id') id: string,
    @Param('closingId') closingId: string,
    @CurrentUser() user: SessionUser,
  ): Promise<{ status: InvestmentStatus; documentsDeleted: number }> {
    return this.lifecycle.deleteClosing(parseId(id, 'Investment id'), parseId(closingId, 'Closing id'), user);
  }

  @Post('investments/:id/capital-events')
  saveCapitalEvent(@Param('id') id: string, @Body() body: unknown, @CurrentUser() user: SessionUser): Promise<SaveCapitalEventResponse> {
    const input = asObject(body);
    const documentId = input.documentId === null || input.documentId === undefined ? null : requireNumber(input, 'documentId', 'Capital event document', { integer: true, min: 1 });
    return this.lifecycle.saveCapitalEvent(parseId(id, 'Investment id'), { documentId, capitalEvent: parseCapitalEventInput(input.capitalEvent) }, user);
  }

  @Delete('investments/:id/capital-events/:eventId')
  deleteCapitalEvent(
    @Param('id') id: string,
    @Param('eventId') eventId: string,
    @CurrentUser() user: SessionUser,
  ): Promise<{ documentsDeleted: number }> {
    return this.lifecycle.deleteCapitalEvent(parseId(id, 'Investment id'), parseId(eventId, 'Capital event id'), user);
  }

  @Post('investments/:id/financial-actuals')
  saveFinancialActual(@Param('id') id: string, @Body() body: unknown, @CurrentUser() user: SessionUser): Promise<SaveFinancialActualResponse> {
    const input = asObject(body);
    const documentId = input.documentId === null || input.documentId === undefined ? null : requireNumber(input, 'documentId', 'Statement document', { integer: true, min: 1 });
    return this.lifecycle.saveFinancialActual(parseId(id, 'Investment id'), { documentId, financialActual: parseFinancialActualInput(input.financialActual) }, user);
  }

  @Delete('investments/:id/financial-actuals/:actualId')
  deleteFinancialActual(
    @Param('id') id: string,
    @Param('actualId') actualId: string,
    @CurrentUser() user: SessionUser,
  ): Promise<{ documentsDeleted: number }> {
    return this.lifecycle.deleteFinancialActual(parseId(id, 'Investment id'), parseId(actualId, 'Financial actual id'), user);
  }

  @Delete('investments/:id')
  deleteInvestment(@Param('id') id: string, @Body() body: unknown, @CurrentUser() user: SessionUser): Promise<DeleteInvestmentResult> {
    const confirm = requireString(asObject(body), 'confirmCompanyName', 'Company name confirmation');
    return this.lifecycle.deleteInvestment(parseId(id, 'Investment id'), confirm, user);
  }

  @Delete('uploads/:documentId')
  @HttpCode(204)
  discardUpload(@Param('documentId') documentId: string): Promise<void> {
    return this.lifecycle.discardUpload(parseId(documentId, 'Document id'));
  }
}
