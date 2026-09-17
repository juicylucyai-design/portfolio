import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import type { IcMemoExtraction, IntakeStatus, SessionUser } from '@nksq/contracts';
import { CurrentUser } from '../../common/public.decorator';
import { asObject, requireNumber } from '../../common/validation';
import { IntakeService } from './intake.service';

@Controller('intake')
export class IntakeController {
  constructor(private readonly intake: IntakeService) {}

  @Get('status')
  status(): IntakeStatus {
    return this.intake.status();
  }

  @Post('ic-memo')
  @HttpCode(200)
  extractIcMemo(@Body() body: unknown, @CurrentUser() user: SessionUser): Promise<IcMemoExtraction> {
    const documentId = requireNumber(asObject(body), 'documentId', 'Document id', { integer: true, min: 1 });
    return this.intake.extractIcMemo(documentId, user);
  }
}
