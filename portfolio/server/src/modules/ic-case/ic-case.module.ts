import { Module } from '@nestjs/common';
import { PortfolioModule } from '../portfolio';
import { IcCaseController } from './ic-case.controller';
import { IcCaseRepository } from './ic-case.repository';
import { IcCaseService } from './ic-case.service';

@Module({
  imports: [PortfolioModule],
  controllers: [IcCaseController],
  providers: [IcCaseRepository, IcCaseService],
  exports: [IcCaseService],
})
export class IcCaseModule {}
