import { Controller, Get, Param } from '@nestjs/common';
import type { Closing } from '@nksq/contracts';
import { parseId } from '../../common/validation';
import { ClosingService } from './closing.service';

// Recording and deleting closings go through the Lifecycle module, because they also save documents
// and move the investment's status.
@Controller()
export class ClosingController {
  constructor(private readonly closings: ClosingService) {}

  @Get('investments/:id/closings')
  list(@Param('id') id: string): Promise<Closing[]> {
    return this.closings.listForInvestment(parseId(id, 'Investment id'));
  }
}
