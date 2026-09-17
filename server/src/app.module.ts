import { Module } from '@nestjs/common';
import { DatabaseModule } from './database/database.module';
import { ClosingModule } from './modules/closing';
import { DocumentsModule } from './modules/documents';
import { IcCaseModule } from './modules/ic-case';
import { IntakeModule } from './modules/intake';
import { LifecycleModule } from './modules/lifecycle';
import { PerformanceModule } from './modules/performance';
import { PortfolioModule } from './modules/portfolio';
import { UsersModule } from './modules/users';

// One line per module from the blueprint. Capital Events, statements and Carry are added here as they're built.
@Module({
  imports: [
    DatabaseModule,
    UsersModule,
    PortfolioModule,
    IcCaseModule,
    ClosingModule,
    PerformanceModule,
    DocumentsModule,
    IntakeModule,
    LifecycleModule,
  ],
})
export class AppModule {}
