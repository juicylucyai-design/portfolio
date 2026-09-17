import { Module } from '@nestjs/common';
import { ClosingModule } from '../closing';
import { IcCaseModule } from '../ic-case';
import { PerformanceModule } from '../performance';
import { PortfolioModule } from '../portfolio';
import { CarryController } from './carry.controller';
import { CarryRepository } from './carry.repository';
import { CarryService } from './carry.service';

@Module({
  imports: [PortfolioModule, PerformanceModule, ClosingModule, IcCaseModule],
  controllers: [CarryController],
  providers: [CarryRepository, CarryService],
  exports: [CarryService],
})
export class CarryModule {}
