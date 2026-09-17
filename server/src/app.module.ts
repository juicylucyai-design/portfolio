import { Module } from '@nestjs/common';
import { DatabaseModule } from './database/database.module';
import { CapitalEventModule } from './modules/capital-event';
import { CarryModule } from './modules/carry';
import { ClosingModule } from './modules/closing';
import { DocumentsModule } from './modules/documents';
import { FinancialActualModule } from './modules/financial-actual';
import { IcCaseModule } from './modules/ic-case';
import { IntakeModule } from './modules/intake';
import { LifecycleModule } from './modules/lifecycle';
import { PerformanceModule } from './modules/performance';
import { PortfolioModule } from './modules/portfolio';
import { UsersModule } from './modules/users';

// One line per module from the blueprint. Statements are added here as they're built.
@Module({
  imports: [
    DatabaseModule,
    UsersModule,
    PortfolioModule,
    IcCaseModule,
    ClosingModule,
    CapitalEventModule,
    PerformanceModule,
    CarryModule,
    DocumentsModule,
    FinancialActualModule,
    IntakeModule,
    LifecycleModule,
  ],
})
export class AppModule {}
