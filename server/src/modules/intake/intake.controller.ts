import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import type { CapitalEventExtraction, ClosingExtraction, IcMemoExtraction, IntakeStatus, SessionUser } from '@nksq/contracts';
import { CurrentUser } from '../../common/public.decorator';
import { asObject, requireNumber } from '../../common/validation';
import { IntakeService } from './intake.service';

const documentIdFrom = (body: unknown) => requireNumber(asObject(body), 'documentId', 'Document id', { integer: true, min: 1 });

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
    return this.intake.extractIcMemo(documentIdFrom(body), user);
  }

  @Post('closing')
  @HttpCode(200)
  extractClosing(@Body() body: unknown, @CurrentUser() user: SessionUser): Promise<ClosingExtraction> {
    return this.intake.extractClosing(documentIdFrom(body), user);
  }

  @Post('capital-event')
  @HttpCode(200)
  extractCapitalEvent(@Body() body: unknown, @CurrentUser() user: SessionUser): Promise<CapitalEventExtraction> {
    return this.intake.extractCapitalEvent(documentIdFrom(body), user);
  }
}
