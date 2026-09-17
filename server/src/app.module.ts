import { Module } from '@nestjs/common';
import { DatabaseModule } from './database/database.module';
import { DocumentsModule } from './modules/documents';
import { IcCaseModule } from './modules/ic-case';
import { IntakeModule } from './modules/intake';
import { LifecycleModule } from './modules/lifecycle';
import { PortfolioModule } from './modules/portfolio';
import { UsersModule } from './modules/users';

// One line per module from the blueprint. Closing, Capital Events, Performance and Carry
// are added here as they're built.
@Module({
  imports: [DatabaseModule, UsersModule, PortfolioModule, IcCaseModule, DocumentsModule, IntakeModule, LifecycleModule],
})
export class AppModule {}
