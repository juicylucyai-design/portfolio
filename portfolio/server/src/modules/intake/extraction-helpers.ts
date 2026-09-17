// Shared pieces for every document Claude reads: schema building blocks and the checks applied to its answers.
//
// Schemas use plain strings, with "" meaning "not in the document", instead of nullable (anyOf) fields:
// the API caps a schema at 16 union-typed fields because each one multiplies compilation cost.

export const TEXT = { type: 'string' };

export const object = (properties: Record<string, unknown>) => ({
  type: 'object',
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});

export const SOURCES_SCHEMA = {
  type: 'array',
  items: object({ field: TEXT, page: { type: 'integer' }, quote: TEXT }),
};

export const WARNINGS_SCHEMA = { type: 'array', items: TEXT };

/** Wording shared by every extraction prompt about how to write values. */
export const VALUE_FORMAT_RULES = `Format: every value is a string. Use an empty string for anything the document does not state or let you derive with confidence; never invent a figure. Write numbers as plain digits with an optional decimal point and minus sign, no currency symbols, commas, units or percent signs (25000000, 20, 24.5). Write dates as YYYY-MM-DD. In sources, use page 0 when you can't tell the page.

Currency: the portfolio system works only in US dollars.
- If amounts are in USD, use them as stated.
- If they are in another currency and the document gives an exchange rate, convert to USD with that rate and describe the rate in a warning.
- If there is no rate in the document, leave the USD fields empty and add a warning naming the currency.
- Write amounts in whole units: "$25M" is 25000000, "₹12.5 crore" is 125000000 rupees.

sources: for each value you filled in, give the field path (for example "closing.sharesAllotted"), the PDF page number it came from, and a short quote of at most 20 words.
warnings: anything a reviewer should double-check: assumptions, derivations, conflicting figures, or values you left empty because the document was ambiguous.`;

export const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export interface Range {
  min?: number;
  max?: number;
  above?: number;
  below?: number;
  integer?: boolean;
}

/**
 * Readers that turn Claude's string values into checked values. Anything malformed or out of range becomes
 * null and adds a warning, so a misread figure is never silently used.
 */
export function createReaders(warnings: string[]) {
  const isBlank = (value: unknown) => value === null || value === undefined || (typeof value === 'string' && value.trim() === '');

  const text = (value: unknown, max = 200): string | null => (typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null);

  const number = (raw: unknown, label: string, range: Range = {}): number | null => {
    if (isBlank(raw)) return null;
    // Tolerate stray formatting like "25,000,000", "$25000000" or "24.5%".
    const value = typeof raw === 'string' ? Number(raw.replace(/[,$%\s]/g, '')) : raw;
    const ok =
      typeof value === 'number' &&
      Number.isFinite(value) &&
      (!range.integer || Number.isInteger(value)) &&
      (range.min === undefined || value >= range.min) &&
      (range.max === undefined || value <= range.max) &&
      (range.above === undefined || value > range.above) &&
      (range.below === undefined || value < range.below);
    if (!ok) {
      warnings.push(`Ignored ${label} (${String(raw)}) because it is not a number in the expected range.`);
      return null;
    }
    return value as number;
  };

  const date = (raw: unknown, label: string): string | null => {
    if (isBlank(raw)) return null;
    const value = typeof raw === 'string' ? raw.trim() : raw;
    if (typeof value === 'string' && DATE.test(value)) {
      const [year, month, day] = value.split('-').map(Number);
      const parsed = new Date(Date.UTC(year, month - 1, day));
      // Rejects dates that don't exist, like 30 February, which Date would otherwise roll into March.
      if (parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day) return value;
    }
    warnings.push(`Ignored ${label} (${String(raw)}) because it is not a valid date.`);
    return null;
  };

  return { isBlank, text, number, date };
}

export function readWarnings(root: Record<string, unknown>): string[] {
  return Array.isArray(root.warnings)
    ? root.warnings.filter((w): w is string => typeof w === 'string' && w.trim() !== '').map((w) => w.slice(0, 500)).slice(0, 30)
    : [];
}

export function readSources(root: Record<string, unknown>): { field: string; page: number | null; quote: string }[] {
  return (Array.isArray(root.sources) ? root.sources : []).slice(0, 40).map((item) => {
    const source = asRecord(item);
    const page = source.page;
    return {
      field: typeof source.field === 'string' && source.field.trim() ? source.field.trim().slice(0, 80) : 'unknown',
      page: typeof page === 'number' && Number.isInteger(page) && page > 0 ? page : null,
      quote: typeof source.quote === 'string' ? source.quote.trim().slice(0, 300) : '',
    };
  });
}

/** Counts union-typed (nullable) fields in a schema; tests keep this at zero. */
export function countUnionFields(node: unknown): number {
  if (!node || typeof node !== 'object') return 0;
  const schema = node as Record<string, unknown>;
  const own = schema.anyOf || Array.isArray(schema.type) ? 1 : 0;
  return own + Object.values(schema).reduce<number>((sum, value) => sum + (Array.isArray(value) ? value.reduce<number>((s, v) => s + countUnionFields(v), 0) : countUnionFields(value)), 0);
}
