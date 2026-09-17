import { Module } from '@nestjs/common';
import { CapitalEventModule } from '../capital-event';
import { ClosingModule } from '../closing';
import { IcCaseModule } from '../ic-case';
import { PortfolioModule } from '../portfolio';
import { PerformanceController } from './performance.controller';
import { PerformanceService } from './performance.service';

// Owns no tables of its own. Statements join here in a later release.
@Module({
  imports: [PortfolioModule, IcCaseModule, ClosingModule, CapitalEventModule],
  controllers: [PerformanceController],
  providers: [PerformanceService],
  exports: [PerformanceService],
})
export class PerformanceModule {}
