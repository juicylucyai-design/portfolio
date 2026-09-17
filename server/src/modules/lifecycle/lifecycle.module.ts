import { Module } from '@nestjs/common';
import { CapitalEventModule } from '../capital-event';
import { CarryModule } from '../carry';
import { ClosingModule } from '../closing';
import { DocumentsModule } from '../documents';
import { IcCaseModule } from '../ic-case';
import { IntakeModule } from '../intake';
import { PortfolioModule } from '../portfolio';
import { LifecycleController } from './lifecycle.controller';
import { LifecycleService } from './lifecycle.service';

@Module({
  imports: [PortfolioModule, IcCaseModule, ClosingModule, CapitalEventModule, CarryModule, DocumentsModule, IntakeModule],
  controllers: [LifecycleController],
  providers: [LifecycleService],
})
export class LifecycleModule {}
