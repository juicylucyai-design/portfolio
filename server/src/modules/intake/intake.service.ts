import { HttpException, Injectable } from '@nestjs/common';
import type { ClosingExtraction, IcMemoExtraction, IntakeStatus, SessionUser } from '@nksq/contracts';
import { DocumentsService } from '../documents';
import { ClaudeClient } from './claude.client';
import { CLOSING_INSTRUCTION, CLOSING_PROMPT_VERSION, CLOSING_SCHEMA, CLOSING_SYSTEM_PROMPT, normaliseClosing } from './closing.extraction';
import { IC_MEMO_INSTRUCTION, IC_MEMO_PROMPT_VERSION, IC_MEMO_SCHEMA, IC_MEMO_SYSTEM_PROMPT, normaliseIcMemo } from './ic-memo.extraction';
import { ExtractionKind, IntakeRepository } from './intake.repository';

interface ExtractionSpec<T> {
  kind: ExtractionKind;
  promptVersion: string;
  system: string;
  instruction: string;
  schema: Record<string, unknown>;
  normalise: (raw: unknown) => T;
}

const IC_MEMO: ExtractionSpec<ReturnType<typeof normaliseIcMemo>> = {
  kind: 'IC_MEMO',
  promptVersion: IC_MEMO_PROMPT_VERSION,
  system: IC_MEMO_SYSTEM_PROMPT,
  instruction: IC_MEMO_INSTRUCTION,
  schema: IC_MEMO_SCHEMA,
  normalise: normaliseIcMemo,
};

const CLOSING: ExtractionSpec<ReturnType<typeof normaliseClosing>> = {
  kind: 'CLOSING',
  promptVersion: CLOSING_PROMPT_VERSION,
  system: CLOSING_SYSTEM_PROMPT,
  instruction: CLOSING_INSTRUCTION,
  schema: CLOSING_SCHEMA,
  normalise: normaliseClosing,
};

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

  extractIcMemo(documentId: number, user: SessionUser): Promise<IcMemoExtraction> {
    return this.extract(documentId, IC_MEMO, user);
  }

  extractClosing(documentId: number, user: SessionUser): Promise<ClosingExtraction> {
    return this.extract(documentId, CLOSING, user);
  }

  deleteForDocuments(documentIds: number[]): Promise<number> {
    return this.repository.deleteForDocuments(documentIds);
  }

  /** Reads a stored PDF with Claude. Every attempt, successful or not, is recorded. */
  private async extract<T extends object>(
    documentId: number,
    spec: ExtractionSpec<T>,
    user: SessionUser,
  ): Promise<T & { extractionId: number; documentId: number; model: string }> {
    const { content } = await this.documents.getFile(documentId);
    const record = { documentId, kind: spec.kind, promptVersion: spec.promptVersion, createdBy: user.username };

    try {
      const answer = await this.claude.readPdfAsJson(content, spec.system, spec.instruction, spec.schema);
      const normalised = spec.normalise(answer.data);
      const extractionId = await this.repository.insert({
        ...record,
        status: 'SUCCEEDED',
        model: answer.model,
        result: answer.data,
        error: null,
        inputTokens: answer.inputTokens,
        outputTokens: answer.outputTokens,
      });
      return { ...normalised, extractionId, documentId, model: answer.model };
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
}
