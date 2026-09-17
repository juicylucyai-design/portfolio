import { Controller, Get, Param } from '@nestjs/common';
import type { CapitalEvent } from '@nksq/contracts';
import { parseId } from '../../common/validation';
import { CapitalEventService } from './capital-event.service';

// Recording and deleting capital events go through the Lifecycle module, because they also save documents.
@Controller()
export class CapitalEventController {
  constructor(private readonly capitalEvents: CapitalEventService) {}

  @Get('investments/:id/capital-events')
  list(@Param('id') id: string): Promise<CapitalEvent[]> {
    return this.capitalEvents.listForInvestment(parseId(id, 'Investment id'));
  }
}
