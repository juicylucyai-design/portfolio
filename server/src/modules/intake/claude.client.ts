import Anthropic from '@anthropic-ai/sdk';
import { HttpException, HttpStatus, Injectable } from '@nestjs/common';

export interface PdfReadResult {
  data: unknown;
  model: string;
  inputTokens: number;
  outputTokens: number;
}

/** The only code that talks to the Claude API. */
@Injectable()
export class ClaudeClient {
  readonly model = process.env.CLAUDE_MODEL?.trim() || 'claude-opus-5';
  private client: Anthropic | null = null;

  isConfigured(): boolean {
    return Boolean(process.env.ANTHROPIC_API_KEY?.trim());
  }

  /**
   * Sends a PDF to Claude and returns JSON that matches `schema` (structured outputs).
   * Streams the response so long documents don't hit HTTP timeouts.
   */
  async readPdfAsJson(pdf: Buffer, system: string, instruction: string, schema: Record<string, unknown>): Promise<PdfReadResult> {
    if (!this.isConfigured()) {
      throw new HttpException('Reading documents with Claude is not set up. Add ANTHROPIC_API_KEY to the app\'s variables.', HttpStatus.SERVICE_UNAVAILABLE);
    }
    this.client ??= new Anthropic();

    let message: Anthropic.Beta.BetaMessage;
    try {
      const stream = this.client.beta.messages.stream({
        model: this.model,
        max_tokens: 16000,
        // If the model declines on policy grounds, the API retries on its recommended fallback model.
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        system,
        output_config: { format: { type: 'json_schema', schema } },
        messages: [
          {
            role: 'user',
            content: [
              { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: pdf.toString('base64') } },
              { type: 'text', text: instruction },
            ],
          },
        ],
      });
      message = await stream.finalMessage();
    } catch (error) {
      throw toHttpError(error);
    }

    if (message.stop_reason === 'refusal') {
      throw new HttpException('Claude declined to read this document. Enter the details by hand.', HttpStatus.UNPROCESSABLE_ENTITY);
    }
    if (message.stop_reason === 'max_tokens') {
      throw new HttpException('Claude\'s answer was cut off before it finished. Try again.', HttpStatus.BAD_GATEWAY);
    }

    const text = message.content.map((block) => (block.type === 'text' ? block.text : '')).join('');
    try {
      return {
        data: JSON.parse(text),
        model: message.model,
        inputTokens: message.usage.input_tokens,
        outputTokens: message.usage.output_tokens,
      };
    } catch {
      throw new HttpException('Claude returned an answer that could not be read. Try again.', HttpStatus.BAD_GATEWAY);
    }
  }
}

function toHttpError(error: unknown): HttpException {
  if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
    return new HttpException('The Claude API key was rejected. Check ANTHROPIC_API_KEY.', HttpStatus.SERVICE_UNAVAILABLE);
  }
  if (error instanceof Anthropic.RateLimitError) {
    return new HttpException('Claude is busy right now. Try again in a minute.', HttpStatus.TOO_MANY_REQUESTS);
  }
  if (error instanceof Anthropic.BadRequestError) {
    return new HttpException(`Claude could not read this PDF: ${error.message}`, HttpStatus.UNPROCESSABLE_ENTITY);
  }
  if (error instanceof Anthropic.APIError) {
    return new HttpException(`The Claude API returned an error (${error.status ?? 'network'}). Try again.`, HttpStatus.BAD_GATEWAY);
  }
  return new HttpException('Could not reach the Claude API. Try again.', HttpStatus.BAD_GATEWAY);
}
