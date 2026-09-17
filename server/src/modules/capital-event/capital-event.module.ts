import { Module } from '@nestjs/common';
import { PortfolioModule } from '../portfolio';
import { CapitalEventController } from './capital-event.controller';
import { CapitalEventRepository } from './capital-event.repository';
import { CapitalEventService } from './capital-event.service';

@Module({
  imports: [PortfolioModule],
  controllers: [CapitalEventController],
  providers: [CapitalEventRepository, CapitalEventService],
  exports: [CapitalEventService],
})
export class CapitalEventModule {}
