import { Module } from '@nestjs/common';
import { DocumentsModule } from '../documents';
import { ClaudeCodeReader } from './claude-code.reader';
import { ClaudeClient } from './claude.client';
import { IntakeController } from './intake.controller';
import { IntakeRepository } from './intake.repository';
import { IntakeService } from './intake.service';
import { chooseReader, PDF_READER, PdfReader } from './pdf-reader';

@Module({
  imports: [DocumentsModule],
  controllers: [IntakeController],
  providers: [
    IntakeRepository,
    IntakeService,
    {
      provide: PDF_READER,
      // Decided once at startup; throws if the local-only reader is requested in production.
      useFactory: (): PdfReader => (chooseReader() === 'claude-code' ? new ClaudeCodeReader() : new ClaudeClient()),
    },
  ],
  exports: [IntakeService],
})
export class IntakeModule {}
