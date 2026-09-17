import { Module } from '@nestjs/common';
import { ClosingModule } from '../closing';
import { IcCaseModule } from '../ic-case';
import { PortfolioModule } from '../portfolio';
import { FinancialActualController } from './financial-actual.controller';
import { FinancialActualRepository } from './financial-actual.repository';
import { FinancialActualService } from './financial-actual.service';

@Module({
  imports: [PortfolioModule, IcCaseModule, ClosingModule],
  controllers: [FinancialActualController],
  providers: [FinancialActualRepository, FinancialActualService],
  exports: [FinancialActualService],
})
export class FinancialActualModule {}
