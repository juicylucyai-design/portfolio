// Money & FX kernel. Everything in the app is USD; arithmetic goes through whole cents so sums never drift.

export function toCents(usd: number): number {
  return Math.round(usd * 100);
}

export function roundUsd(usd: number): number {
  return toCents(usd) / 100;
}

export function sumUsd(amounts: number[]): number {
  return amounts.reduce((cents, amount) => cents + toCents(amount), 0) / 100;
}

export function roundTo(value: number, places: number): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}
