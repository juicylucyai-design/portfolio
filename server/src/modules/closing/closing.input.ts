import { BadRequestException } from '@nestjs/common';
import type { ClosingExpenseInput, ClosingInput, ExpenseCategory } from '@nksq/contracts';
import { asObject, Input, optionalString, requireDate, requireNumber } from '../../common/validation';

export const EXPENSE_CATEGORIES: ExpenseCategory[] = ['LEGAL', 'DUE_DILIGENCE', 'STAMP_DUTY', 'ADVISORY', 'OTHER'];
const MAX_EXPENSES = 30;

function optionalNumber(input: Input, key: string, label: string, options: { greaterThan?: number; integer?: boolean; min?: number } = {}): number | null {
  const raw = input[key];
  if (raw === null || raw === undefined || raw === '') return null;
  return requireNumber(input, key, label, options);
}

/** Validates a closing from a request body. Error messages use the form's field labels. */
export function parseClosingInput(body: unknown): ClosingInput {
  const input = asObject(body, 'Closing');

  const currency = (optionalString(input, 'originalCurrency', 'Currency paid in', 3) ?? 'USD').toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) throw new BadRequestException('Currency paid in must be a three-letter code such as USD or INR.');

  const rawExpenses = input.expenses ?? [];
  if (!Array.isArray(rawExpenses)) throw new BadRequestException('Expenses must be a list.');
  if (rawExpenses.length > MAX_EXPENSES) throw new BadRequestException(`A closing can have at most ${MAX_EXPENSES} expense lines.`);
  const expenses: ClosingExpenseInput[] = rawExpenses.map((raw, index) => {
    const expense = asObject(raw, `Expense ${index + 1}`);
    const category = expense.category as ExpenseCategory;
    if (!EXPENSE_CATEGORIES.includes(category)) throw new BadRequestException(`Expense ${index + 1} needs a type.`);
    return {
      category,
      description: optionalString(expense, 'description', `Expense ${index + 1} description`, 200),
      amountUsd: requireNumber(expense, 'amountUsd', `Expense ${index + 1} amount`, { min: 0 }),
    };
  });

  const closing: ClosingInput = {
    closeDate: requireDate(input, 'closeDate', 'Close date'),
    icTrancheNumber: optionalNumber(input, 'icTrancheNumber', 'IC tranche', { integer: true, min: 1 }),
    securityClass: optionalString(input, 'securityClass', 'Security', 120),
    sharesAllotted: requireNumber(input, 'sharesAllotted', 'Shares allotted', { greaterThan: 0 }),
    pricePerShareUsd: requireNumber(input, 'pricePerShareUsd', 'Price per share', { greaterThan: 0 }),
    amountInvestedUsd: requireNumber(input, 'amountInvestedUsd', 'Amount invested', { greaterThan: 0 }),
    originalCurrency: currency,
    originalAmount: optionalNumber(input, 'originalAmount', `Amount in ${currency}`, { greaterThan: 0 }),
    originalPricePerShare: optionalNumber(input, 'originalPricePerShare', `Price per share in ${currency}`, { greaterThan: 0 }),
    fxRateUsdPerUnit: optionalNumber(input, 'fxRateUsdPerUnit', 'Exchange rate', { greaterThan: 0 }),
    postMoneyValuationUsd: optionalNumber(input, 'postMoneyValuationUsd', 'Post-money valuation', { greaterThan: 0 }),
    fullyDilutedSharesAfter: optionalNumber(input, 'fullyDilutedSharesAfter', 'Fully diluted shares after closing', { greaterThan: 0 }),
    ownershipPctAfter: requireNumber(input, 'ownershipPctAfter', 'Ownership after closing', { greaterThan: 0, max: 100 }),
    notes: optionalString(input, 'notes', 'Notes', 4000),
    expenses,
  };

  if (currency !== 'USD' && closing.fxRateUsdPerUnit === null) {
    throw new BadRequestException(`Enter the exchange rate used to convert ${currency} to USD.`);
  }
  return closing;
}
