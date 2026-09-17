import { Module } from '@nestjs/common';
import { DocumentsModule } from '../documents';
import { ClaudeClient } from './claude.client';
import { IntakeController } from './intake.controller';
import { IntakeRepository } from './intake.repository';
import { IntakeService } from './intake.service';

@Module({
  imports: [DocumentsModule],
  controllers: [IntakeController],
  providers: [ClaudeClient, IntakeRepository, IntakeService],
  exports: [IntakeService],
})
export class IntakeModule {}
