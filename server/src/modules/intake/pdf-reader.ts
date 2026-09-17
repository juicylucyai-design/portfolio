// How the Intake module gets a document read by Claude. Two interchangeable readers:
// - 'api' (default, production): the Claude API with ANTHROPIC_API_KEY. See claude.client.ts.
// - 'claude-code' (local testing only): the Claude Code CLI bundled with the Claude desktop app, signed in with
//   your Claude account, so no API key is needed. See claude-code.reader.ts.
// Choose with CLAUDE_READER. The rest of the app never knows which one is in use.

export type DocumentContentType = 'application/pdf' | 'text/plain';

export interface PdfReadResult {
  data: unknown;
  model: string;
  inputTokens: number;
  outputTokens: number;
}

export interface PdfReader {
  readonly kind: 'api' | 'claude-code';
  readonly model: string;
  isConfigured(): boolean;
  /** `content` is the raw PDF bytes for 'application/pdf', or the plain text itself (UTF-8) for 'text/plain'. */
  readDocumentAsJson(
    content: Buffer,
    contentType: DocumentContentType,
    system: string,
    instruction: string,
    schema: Record<string, unknown>,
  ): Promise<PdfReadResult>;
}

export const PDF_READER = Symbol('PDF_READER');

export type ReaderKind = PdfReader['kind'];

/** Reads CLAUDE_READER and refuses the local-only reader anywhere that looks like production. */
export function chooseReader(env: NodeJS.ProcessEnv = process.env): ReaderKind {
  const requested = (env.CLAUDE_READER ?? 'api').trim().toLowerCase();
  if (requested !== 'api' && requested !== 'claude-code') {
    throw new Error(`CLAUDE_READER must be "api" or "claude-code", not "${env.CLAUDE_READER}".`);
  }
  if (requested === 'claude-code' && (env.NODE_ENV === 'production' || env.RAILWAY_ENVIRONMENT || env.RAILWAY_PROJECT_ID)) {
    throw new Error('CLAUDE_READER=claude-code is for locally hosted testing only and is not allowed in production or on Railway.');
  }
  return requested;
}
