import { HttpException, Inject, Injectable } from '@nestjs/common';
import type { CapitalEventExtraction, ClosingExtraction, IcMemoExtraction, IntakeStatus, SessionUser } from '@nksq/contracts';
import { DocumentsService } from '../documents';
import { CAPITAL_EVENT_INSTRUCTION, CAPITAL_EVENT_PROMPT_VERSION, CAPITAL_EVENT_SCHEMA, CAPITAL_EVENT_SYSTEM_PROMPT, normaliseCapitalEvent } from './capital-event.extraction';
import { emailToText } from './email';
import { PDF_READER, type PdfReader } from './pdf-reader';
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

const CAPITAL_EVENT: ExtractionSpec<ReturnType<typeof normaliseCapitalEvent>> = {
  kind: 'CAPITAL_EVENT',
  promptVersion: CAPITAL_EVENT_PROMPT_VERSION,
  system: CAPITAL_EVENT_SYSTEM_PROMPT,
  instruction: CAPITAL_EVENT_INSTRUCTION,
  schema: CAPITAL_EVENT_SCHEMA,
  normalise: normaliseCapitalEvent,
};

@Injectable()
export class IntakeService {
  constructor(
    @Inject(PDF_READER) private readonly claude: PdfReader,
    private readonly repository: IntakeRepository,
    private readonly documents: DocumentsService,
  ) {}

  status(): IntakeStatus {
    return { configured: this.claude.isConfigured(), model: this.claude.model, reader: this.claude.kind };
  }

  extractIcMemo(documentId: number, user: SessionUser): Promise<IcMemoExtraction> {
    return this.extract(documentId, IC_MEMO, user);
  }

  extractClosing(documentId: number, user: SessionUser): Promise<ClosingExtraction> {
    return this.extract(documentId, CLOSING, user);
  }

  extractCapitalEvent(documentId: number, user: SessionUser): Promise<CapitalEventExtraction> {
    return this.extract(documentId, CAPITAL_EVENT, user);
  }

  deleteForDocuments(documentIds: number[]): Promise<number> {
    return this.repository.deleteForDocuments(documentIds);
  }

  /** Reads a stored document with Claude. Every attempt, successful or not, is recorded. Emails (.eml) are
   *  decoded to plain text first; Claude reads everything else (PDFs) as-is. */
  private async extract<T extends object>(
    documentId: number,
    spec: ExtractionSpec<T>,
    user: SessionUser,
  ): Promise<T & { extractionId: number; documentId: number; model: string }> {
    const { document, content } = await this.documents.getFile(documentId);
    const record = { documentId, kind: spec.kind, promptVersion: spec.promptVersion, createdBy: user.username };

    try {
      const isEmail = document.contentType === 'message/rfc822';
      const readContent = isEmail ? Buffer.from(await emailToText(content), 'utf-8') : content;
      const answer = await this.claude.readDocumentAsJson(readContent, isEmail ? 'text/plain' : 'application/pdf', spec.system, spec.instruction, spec.schema);
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
