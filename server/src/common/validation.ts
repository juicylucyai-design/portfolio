import { BadRequestException } from '@nestjs/common';

// Small, explicit input checks for controllers. Each error names the field the way the form labels it.

export type Input = Record<string, unknown>;

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function asObject(body: unknown, label = 'Request body'): Input {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new BadRequestException(`${label} must be a JSON object.`);
  }
  return body as Input;
}

export function requireString(input: Input, key: string, label: string, options: { trim?: boolean; max?: number } = {}): string {
  const raw = input[key];
  if (typeof raw !== 'string') throw new BadRequestException(`${label} is required.`);
  const value = options.trim === false ? raw : raw.trim();
  if (!value) throw new BadRequestException(`${label} is required.`);
  if (value.length > (options.max ?? 200)) throw new BadRequestException(`${label} must be ${options.max ?? 200} characters or fewer.`);
  return value;
}

export function optionalString(input: Input, key: string, label: string, max = 500): string | null {
  const raw = input[key];
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== 'string') throw new BadRequestException(`${label} must be text.`);
  const value = raw.trim();
  if (value.length > max) throw new BadRequestException(`${label} must be ${max} characters or fewer.`);
  return value || null;
}

export function optionalNumber(input: Input, key: string, label: string, options: { min?: number; max?: number } = {}): number | null {
  const raw = input[key];
  if (raw === undefined || raw === null || raw === '') return null;
  const value = typeof raw === 'string' && raw.trim() !== '' ? Number(raw.replace(/,/g, '')) : raw;
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new BadRequestException(`${label} must be a number.`);
  if (options.min !== undefined && value < options.min) throw new BadRequestException(`${label} must be at least ${options.min}.`);
  if (options.max !== undefined && value > options.max) throw new BadRequestException(`${label} must be at most ${options.max}.`);
  return value;
}

export function requireNumber(
  input: Input,
  key: string,
  label: string,
  options: { min?: number; max?: number; greaterThan?: number; lessThan?: number; integer?: boolean } = {},
): number {
  const raw = input[key];
  const value = typeof raw === 'string' && raw.trim() !== '' ? Number(raw.replace(/,/g, '')) : raw;
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new BadRequestException(`${label} must be a number.`);
  if (options.integer && !Number.isInteger(value)) throw new BadRequestException(`${label} must be a whole number.`);
  if (options.min !== undefined && value < options.min) throw new BadRequestException(`${label} must be at least ${options.min}.`);
  if (options.max !== undefined && value > options.max) throw new BadRequestException(`${label} must be at most ${options.max}.`);
  if (options.greaterThan !== undefined && value <= options.greaterThan) {
    throw new BadRequestException(`${label} must be greater than ${options.greaterThan}.`);
  }
  if (options.lessThan !== undefined && value >= options.lessThan) {
    throw new BadRequestException(`${label} must be less than ${options.lessThan}.`);
  }
  return value;
}

export function requireDate(input: Input, key: string, label: string): string {
  const raw = input[key];
  if (typeof raw !== 'string' || !DATE_PATTERN.test(raw)) throw new BadRequestException(`${label} must be a date (YYYY-MM-DD).`);
  const [year, month, day] = raw.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) {
    throw new BadRequestException(`${label} is not a real date.`);
  }
  return raw;
}

export function requireArray(input: Input, key: string, label: string): unknown[] {
  const raw = input[key];
  if (!Array.isArray(raw) || raw.length === 0) throw new BadRequestException(`Add at least one ${label}.`);
  return raw;
}

export function parseId(raw: string, label = 'Id'): number {
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) throw new BadRequestException(`${label} must be a positive whole number.`);
  return value;
}
