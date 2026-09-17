import { Body, Controller, Delete, HttpCode, Param, Post } from '@nestjs/common';
import type { CreateFromIcMemoResponse, DeleteInvestmentResult, InvestmentStatus, SaveClosingResponse, SessionUser } from '@nksq/contracts';
import { CurrentUser } from '../../common/public.decorator';
import { asObject, parseId, requireNumber, requireString } from '../../common/validation';
import { parseClosingInput } from '../closing';
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
  saveClosing(@Param('id') id: string, @Body() body: unknown, @CurrentUser() user: SessionUser): Promise<SaveClosingResponse> {
    const input = asObject(body);
    const documentId = input.documentId === null || input.documentId === undefined ? null : requireNumber(input, 'documentId', 'Closing document', { integer: true, min: 1 });
    return this.lifecycle.saveClosing(parseId(id, 'Investment id'), { documentId, closing: parseClosingInput(input.closing) }, user);
  }

  @Delete('investments/:id/closings/:closingId')
  deleteClosing(
    @Param('id') id: string,
    @Param('closingId') closingId: string,
    @CurrentUser() user: SessionUser,
  ): Promise<{ status: InvestmentStatus; documentsDeleted: number }> {
    return this.lifecycle.deleteClosing(parseId(id, 'Investment id'), parseId(closingId, 'Closing id'), user);
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
