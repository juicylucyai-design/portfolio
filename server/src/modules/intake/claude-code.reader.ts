import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { spawn } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { DocumentContentType, PdfReader, PdfReadResult } from './pdf-reader';

const TIMEOUT_MS = 10 * 60 * 1000;

/** Newest Claude Code bundled with the Claude desktop app, unless CLAUDE_CODE_PATH points somewhere else. */
export function findClaudeCode(env: NodeJS.ProcessEnv = process.env): string | null {
  if (env.CLAUDE_CODE_PATH?.trim()) return existsSync(env.CLAUDE_CODE_PATH.trim()) ? env.CLAUDE_CODE_PATH.trim() : null;

  const bundled = env.APPDATA ? path.join(env.APPDATA, 'Claude', 'claude-code') : null;
  if (bundled && existsSync(bundled)) {
    const byVersion = readdirSync(bundled)
      .filter((name) => /^\d+(\.\d+)*$/.test(name))
      .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
    for (const version of byVersion) {
      const exe = path.join(bundled, version, process.platform === 'win32' ? 'claude.exe' : 'claude');
      if (existsSync(exe)) return exe;
    }
  }
  return null;
}

interface CliResult {
  is_error?: boolean;
  result?: string;
  structured_output?: unknown;
  modelUsage?: Record<string, unknown>;
  usage?: { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number };
}

/**
 * Local testing only: reads documents with the Claude Code CLI from the Claude desktop app, signed in with your
 * Claude account instead of an API key. The document is copied to a private temporary folder, Claude Code may only
 * use its Read tool inside that folder, and the answer must match the same JSON schema the API reader uses.
 */
@Injectable()
export class ClaudeCodeReader implements PdfReader {
  readonly kind = 'claude-code' as const;
  readonly model = process.env.CLAUDE_CODE_MODEL?.trim() || 'opus';
  private readonly logger = new Logger('ClaudeCodeReader');

  isConfigured(): boolean {
    return findClaudeCode() !== null;
  }

  async readDocumentAsJson(
    content: Buffer,
    contentType: DocumentContentType,
    system: string,
    instruction: string,
    schema: Record<string, unknown>,
  ): Promise<PdfReadResult> {
    const exe = findClaudeCode();
    if (!exe) {
      throw new HttpException('Claude Code was not found. Install the Claude desktop app, or set CLAUDE_CODE_PATH.', HttpStatus.SERVICE_UNAVAILABLE);
    }

    const fileName = contentType === 'application/pdf' ? 'document.pdf' : 'document.txt';
    const readInstruction =
      contentType === 'application/pdf'
        ? `Read ${fileName} in the current directory. Read every page (use the pages parameter for long documents).`
        : `Read ${fileName} in the current directory.`;

    const workDir = await mkdtemp(path.join(os.tmpdir(), 'nksq-read-'));
    try {
      await writeFile(path.join(workDir, fileName), content);
      const args = [
        '-p',
        `${readInstruction} ${instruction}`,
        '--system-prompt', system,
        '--output-format', 'json',
        '--json-schema', JSON.stringify(schema),
        '--tools', 'Read',
        '--allowedTools', 'Read',
        '--permission-prompts', 'none',
        '--strict-mcp-config',
        '--no-session-persistence',
        '--model', this.model,
      ];
      // Leave ANTHROPIC_API_KEY out so Claude Code uses the desktop sign-in, which is the point of this reader.
      const env = { ...process.env };
      delete env.ANTHROPIC_API_KEY;

      const started = Date.now();
      const output = await run(exe, args, workDir, env);
      const result = parse(output, exe);
      const model = Object.keys(result.modelUsage ?? {})[0] ?? this.model;
      this.logger.log(`Read a ${Math.round(content.length / 1024)} KB document with Claude Code (${model}) in ${((Date.now() - started) / 1000).toFixed(0)}s`);
      return {
        data: result.structured_output,
        model: `claude-code/${model}`,
        inputTokens: (result.usage?.input_tokens ?? 0) + (result.usage?.cache_read_input_tokens ?? 0) + (result.usage?.cache_creation_input_tokens ?? 0),
        outputTokens: result.usage?.output_tokens ?? 0,
      };
    } finally {
      await rm(workDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }
}

function run(exe: string, args: string[], cwd: string, env: NodeJS.ProcessEnv): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(exe, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill();
      reject(new HttpException('Claude Code took longer than 10 minutes to read the document.', HttpStatus.GATEWAY_TIMEOUT));
    }, TIMEOUT_MS);
    child.stdout.on('data', (chunk) => (stdout += chunk));
    child.stderr.on('data', (chunk) => (stderr += chunk));
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(new HttpException(`Could not start Claude Code: ${error.message}`, HttpStatus.SERVICE_UNAVAILABLE));
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
  });
}

function parse(output: { code: number | null; stdout: string; stderr: string }, exe: string): CliResult {
  let result: CliResult;
  try {
    result = JSON.parse(output.stdout) as CliResult;
  } catch {
    const detail = (output.stderr || output.stdout).trim().slice(0, 300);
    throw new HttpException(`Claude Code did not return a readable answer${detail ? `: ${detail}` : '.'}`, HttpStatus.BAD_GATEWAY);
  }

  if (result.is_error) {
    const message = result.result ?? 'unknown error';
    if (/not logged in|\/login/i.test(message)) {
      throw new HttpException(`Claude Code is not signed in. In a terminal, run: & "${exe}" auth login`, HttpStatus.SERVICE_UNAVAILABLE);
    }
    throw new HttpException(`Claude Code could not read the document: ${message.slice(0, 300)}`, HttpStatus.BAD_GATEWAY);
  }
  if (!result.structured_output || typeof result.structured_output !== 'object') {
    throw new HttpException('Claude Code finished without returning the extracted fields. Try again.', HttpStatus.BAD_GATEWAY);
  }
  return result;
}
