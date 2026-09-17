import { Module } from '@nestjs/common';
import { PortfolioController } from './portfolio.controller';
import { PortfolioRepository } from './portfolio.repository';
import { PortfolioService } from './portfolio.service';

@Module({
  controllers: [PortfolioController],
  providers: [PortfolioRepository, PortfolioService],
  exports: [PortfolioService],
})
export class PortfolioModule {}
