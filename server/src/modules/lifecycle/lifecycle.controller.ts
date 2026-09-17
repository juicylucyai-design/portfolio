import { Body, Controller, Delete, HttpCode, Param, Post } from '@nestjs/common';
import type { CreateFromIcMemoResponse, DeleteInvestmentResult, SessionUser } from '@nksq/contracts';
import { CurrentUser } from '../../common/public.decorator';
import { asObject, parseId, requireNumber, requireString } from '../../common/validation';
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
