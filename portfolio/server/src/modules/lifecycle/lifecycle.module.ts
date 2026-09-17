import { Module } from '@nestjs/common';
import { ClosingModule } from '../closing';
import { DocumentsModule } from '../documents';
import { IcCaseModule } from '../ic-case';
import { IntakeModule } from '../intake';
import { PortfolioModule } from '../portfolio';
import { LifecycleController } from './lifecycle.controller';
import { LifecycleService } from './lifecycle.service';

@Module({
  imports: [PortfolioModule, IcCaseModule, ClosingModule, DocumentsModule, IntakeModule],
  controllers: [LifecycleController],
  providers: [LifecycleService],
})
export class LifecycleModule {}
