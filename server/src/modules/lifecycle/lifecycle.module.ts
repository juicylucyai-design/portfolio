import { Module } from '@nestjs/common';
import { DocumentsModule } from '../documents';
import { IcCaseModule } from '../ic-case';
import { IntakeModule } from '../intake';
import { PortfolioModule } from '../portfolio';
import { LifecycleController } from './lifecycle.controller';
import { LifecycleService } from './lifecycle.service';

@Module({
  imports: [PortfolioModule, IcCaseModule, DocumentsModule, IntakeModule],
  controllers: [LifecycleController],
  providers: [LifecycleService],
})
export class LifecycleModule {}
