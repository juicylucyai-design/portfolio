import { Module } from '@nestjs/common';
import { IcCaseModule } from '../ic-case';
import { PortfolioModule } from '../portfolio';
import { ClosingController } from './closing.controller';
import { ClosingRepository } from './closing.repository';
import { ClosingService } from './closing.service';

@Module({
  imports: [PortfolioModule, IcCaseModule],
  controllers: [ClosingController],
  providers: [ClosingRepository, ClosingService],
  exports: [ClosingService],
})
export class ClosingModule {}
