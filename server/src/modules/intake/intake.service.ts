import { HttpException, Injectable } from '@nestjs/common';
import type { IcMemoExtraction, IntakeStatus, SessionUser } from '@nksq/contracts';
import { DocumentsService } from '../documents';
import { ClaudeClient } from './claude.client';
import { IC_MEMO_INSTRUCTION, IC_MEMO_PROMPT_VERSION, IC_MEMO_SCHEMA, IC_MEMO_SYSTEM_PROMPT, normaliseIcMemo } from './ic-memo.extraction';
import { IntakeRepository } from './intake.repository';

@Injectable()
export class IntakeService {
  constructor(
    private readonly claude: ClaudeClient,
    private readonly repository: IntakeRepository,
    private readonly documents: DocumentsService,
  ) {}

  status(): IntakeStatus {
    return { configured: this.claude.isConfigured(), model: this.claude.model };
  }

  /** Reads an uploaded IC memo with Claude. Every attempt, successful or not, is recorded. */
  async extractIcMemo(documentId: number, user: SessionUser): Promise<IcMemoExtraction> {
    const { content } = await this.documents.getFile(documentId);
    const record = { documentId, kind: 'IC_MEMO' as const, promptVersion: IC_MEMO_PROMPT_VERSION, createdBy: user.username };

    try {
      const answer = await this.claude.readPdfAsJson(content, IC_MEMO_SYSTEM_PROMPT, IC_MEMO_INSTRUCTION, IC_MEMO_SCHEMA);
      const normalised = normaliseIcMemo(answer.data);
      const extractionId = await this.repository.insert({
        ...record,
        status: 'SUCCEEDED',
        model: answer.model,
        result: answer.data,
        error: null,
        inputTokens: answer.inputTokens,
        outputTokens: answer.outputTokens,
      });
      return { extractionId, documentId, model: answer.model, ...normalised };
    } catch (error) {
      if (!(error instanceof HttpException && error.getStatus() === 503)) {
        await this.repository.insert({
          ...record,
          status: 'FAILED',
          model: this.claude.model,
          result: null,
          error: error instanceof Error ? error.message : String(error),
          inputTokens: null,
          outputTokens: null,
        });
      }
      throw error;
    }
  }

  deleteForDocuments(documentIds: number[]): Promise<number> {
    return this.repository.deleteForDocuments(documentIds);
  }
}
