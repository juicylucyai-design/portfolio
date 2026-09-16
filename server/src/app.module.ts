import { Module } from '@nestjs/common';
import { DatabaseModule } from './database/database.module';
import { IcCaseModule } from './modules/ic-case';
import { PortfolioModule } from './modules/portfolio';
import { UsersModule } from './modules/users';

// One line per module from the blueprint. Closing, Capital Events, Performance, Carry,
// Statement Intake and Documents are added here as they're built.
@Module({
  imports: [DatabaseModule, UsersModule, PortfolioModule, IcCaseModule],
})
export class AppModule {}
