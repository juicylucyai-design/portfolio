import { Module } from '@nestjs/common';
import { ClosingModule } from '../closing';
import { IcCaseModule } from '../ic-case';
import { PortfolioModule } from '../portfolio';
import { PerformanceController } from './performance.controller';
import { PerformanceService } from './performance.service';

// Owns no tables yet. Statements and valuations join here in a later release.
@Module({
  imports: [PortfolioModule, IcCaseModule, ClosingModule],
  controllers: [PerformanceController],
  providers: [PerformanceService],
  exports: [PerformanceService],
})
export class PerformanceModule {}
