// Contracts shared by the View (web) and the API (server).
// Types only: nothing here runs, so both sides can import it freely.
// All money is in USD. Percentages are 0–100. Rates (IRR) are fractions (0.25 = 25%).

export type Role = 'admin' | 'member';

export interface SessionUser {
  id: number;
  username: string;
  displayName: string;
  role: Role;
}

export interface LoginRequest {
  username: string;
  password: string;
}

// ---- Portfolio ----

export type InvestmentStatus =
  | 'PIPELINE'
  | 'IC_APPROVED'
  | 'PARTLY_DRAWN'
  | 'CLOSED'
  | 'ACTIVE'
  | 'EXITED'
  | 'WRITTEN_OFF';

export interface Investment {
  id: number;
  companyId: number;
  companyName: string;
  /** Two or three sentences on what the company does, read from the IC memo or written by hand. */
  businessSummary: string | null;
  sector: string | null;
  geography: string | null;
  fiscalYearEndMonth: number;
  instrument: string;
  dealLead: string | null;
  status: InvestmentStatus;
  createdBy: string | null;
  createdAt: string;
}

export interface CreateInvestmentRequest {
  companyName: string;
  businessSummary?: string | null;
  sector?: string | null;
  geography?: string | null;
  fiscalYearEndMonth: number;
  instrument: string;
  dealLead?: string | null;
}

export interface UpdateBusinessSummaryRequest {
  businessSummary: string | null;
}

// ---- IC Case ----

export interface IcTrancheInput {
  amountUsd: number;
  expectedDate: string; // YYYY-MM-DD
  milestone?: string | null;
}

/** One year of the IC memo's financial projections. Revenue and EBITDA can each be null if the memo only gives one. */
export interface IcFinancialInput {
  year: number;
  revenueUsd: number | null;
  ebitdaUsd: number | null;
}

export interface IcCaseInput {
  approvedOn: string; // YYYY-MM-DD
  entryPostMoneyUsd: number;
  entryOwnershipPct: number;
  dilutionToExitPct: number;
  exitYear: number;
  exitValuationUsd: number;
  notes?: string | null;
  tranches: IcTrancheInput[];
  financials: IcFinancialInput[];
}

export interface IcProjection {
  commitmentUsd: number;
  exitOwnershipPct: number;
  projectedProceedsUsd: number;
  projectedMoic: number;
  projectedIrr: number | null;
  exitDate: string;
}

export interface IcTranche extends IcTrancheInput {
  trancheNumber: number;
  milestone: string | null;
}

export interface IcCase extends IcProjection {
  id: number;
  investmentId: number;
  version: number;
  approvedOn: string;
  entryPostMoneyUsd: number;
  entryOwnershipPct: number;
  dilutionToExitPct: number;
  exitYear: number;
  exitValuationUsd: number;
  notes: string | null;
  supersededBy: number | null;
  createdBy: string | null;
  createdAt: string;
  tranches: IcTranche[];
  financials: IcFinancialInput[];
}

export interface IcCaseSummary {
  investmentId: number;
  version: number;
  commitmentUsd: number;
  projectedProceedsUsd: number;
  projectedMoic: number;
  projectedIrr: number | null;
  exitYear: number;
  exitValuationUsd: number;
  entryPostMoneyUsd: number;
  entryOwnershipPct: number;
  dilutionToExitPct: number;
  tranches: IcTranche[];
  financials: IcFinancialInput[];
}

// ---- Closing: what actually happened. Replaces the IC approval as the record of the transaction. ----

export type ExpenseCategory = 'LEGAL' | 'DUE_DILIGENCE' | 'STAMP_DUTY' | 'ADVISORY' | 'OTHER';

export interface ClosingExpenseInput {
  category: ExpenseCategory;
  description: string | null;
  amountUsd: number;
}

export interface ClosingInput {
  closeDate: string; // YYYY-MM-DD
  /** Which IC tranche this closing draws, or null if it isn't tied to one. */
  icTrancheNumber: number | null;
  securityClass: string | null;
  sharesAllotted: number;
  pricePerShareUsd: number;
  amountInvestedUsd: number;
  /** Currency actually paid (ISO code). Amounts above are always USD. */
  originalCurrency: string;
  originalAmount: number | null;
  originalPricePerShare: number | null;
  /** US dollars per one unit of originalCurrency. */
  fxRateUsdPerUnit: number | null;
  postMoneyValuationUsd: number | null;
  fullyDilutedSharesAfter: number | null;
  /** NKSquared's fully diluted ownership after this closing, 0–100. */
  ownershipPctAfter: number;
  notes: string | null;
  expenses: ClosingExpenseInput[];
}

export interface Closing extends ClosingInput {
  id: number;
  investmentId: number;
  closingNumber: number;
  expensesTotalUsd: number;
  /** Amount invested plus expenses. */
  totalCostUsd: number;
  createdBy: string | null;
  createdAt: string;
}

export interface SaveClosingsRequest {
  /** The uploaded closing PDF, or null to record the closing(s) without one. One closing document can draw
   *  more than one IC tranche at once (e.g. a combined allotment); each tranche is still its own closing record,
   *  and each gets its own copy of the document as evidence. */
  documentId: number | null;
  closings: ClosingInput[];
}

export interface SaveClosingsResponse {
  closings: Closing[];
  /** Parallel to closings: the document attached to each, or null if none was uploaded. */
  documents: (DocumentInfo | null)[];
  status: InvestmentStatus;
}

// ---- Capital events: things that happen after NKSquared has invested (secondaries, marks, dividends, calls) ----

export type CapitalEventType = 'SECONDARY_TRANSACTION' | 'VALUATION_MARK' | 'DIVIDEND' | 'CAPITAL_CALL' | 'TENDER_OFFER' | 'OTHER';

export interface CapitalEventInput {
  eventType: CapitalEventType;
  eventDate: string; // YYYY-MM-DD
  sellingParty: string | null;
  buyingParty: string | null;
  securityClass: string | null;
  shares: number | null;
  pricePerShareUsd: number | null;
  totalConsiderationUsd: number | null;
  /** The company's implied valuation from this event, if it was a priced transaction. Marks the investment's
   *  current valuation once this event is more recent than the latest closing. */
  impliedValuationUsd: number | null;
  /** A response deadline stated in the source (e.g. a ROFR exercise window), if any. Informational only for now. */
  deadlineDate: string | null;
  notes: string | null;
}

export interface CapitalEvent extends CapitalEventInput {
  id: number;
  investmentId: number;
  createdBy: string | null;
  createdAt: string;
}

export interface SaveCapitalEventRequest {
  /** The uploaded evidence (email or PDF), or null to record it without one. */
  documentId: number | null;
  capitalEvent: CapitalEventInput;
}

export interface SaveCapitalEventResponse {
  capitalEvent: CapitalEvent;
  document: DocumentInfo | null;
}

// ---- Financial actuals: quarterly and annual statements, compared against the IC memo's projections ----

export type FinancialPeriodType = 'QUARTERLY' | 'ANNUAL';

export interface FinancialActualInput {
  periodType: FinancialPeriodType;
  fiscalYear: number;
  /** 1–4 for a QUARTERLY statement, null for an ANNUAL one. */
  quarter: number | null;
  periodEndDate: string; // YYYY-MM-DD
  revenueUsd: number | null;
  ebitdaUsd: number | null;
  notes?: string | null;
}

export interface FinancialActual extends FinancialActualInput {
  id: number;
  investmentId: number;
  createdBy: string | null;
  createdAt: string;
}

export interface SaveFinancialActualRequest {
  /** The uploaded statement (PDF), or null to record it without one. */
  documentId: number | null;
  financialActual: FinancialActualInput;
}

export interface SaveFinancialActualResponse {
  financialActual: FinancialActual;
  document: DocumentInfo | null;
}

export type ExpectationStatus = 'BEATING' | 'MEETING' | 'BELOW';

/** One fiscal year's projected-vs-actual revenue and EBITDA, with a status per metric. Null status means
 *  there's nothing to compare yet (no projection, or no actual reported for that year). */
export interface YearComparison {
  year: number;
  projectedRevenueUsd: number | null;
  projectedEbitdaUsd: number | null;
  /** Annual actual if one was reported; otherwise the sum of whatever quarters have been reported. */
  actualRevenueUsd: number | null;
  actualEbitdaUsd: number | null;
  /** How many quarters make up the actual figures above; 0 when it's a full annual actual (or no actual). */
  quartersReported: number;
  revenueStatus: ExpectationStatus | null;
  ebitdaStatus: ExpectationStatus | null;
}

export interface ExtractedFinancialStatement {
  periodType: FinancialPeriodType | null;
  fiscalYear: number | null;
  quarter: number | null;
  periodEndDate: string | null;
  revenueUsd: number | null;
  ebitdaUsd: number | null;
}

/** Everything Claude could read from a quarterly or annual financial statement. */
export interface FinancialStatementExtraction {
  extractionId: number;
  documentId: number;
  model: string;
  statement: ExtractedFinancialStatement;
  sources: { field: string; page: number | null; quote: string }[];
  warnings: string[];
}

// ---- Carry: the deal-team incentive plan ----

export interface CarrySettings {
  /** Minimum annual return, e.g. 12 for 12%, compounded over the holding period, before carry applies. */
  hurdleRatePct: number;
}

export interface CarryTermsInput {
  /** Non-qualified investments are a pass-through: no carry, recorded at the time of investment. */
  qualified: boolean;
  originationPerson: string | null;
  /** 0–5. */
  originationPct: number;
  monitoringPerson: string | null;
  /** 0–5. */
  monitoringPct: number;
  closurePerson: string | null;
  /** 0–10. */
  closurePct: number;
}

export interface CarryTerms extends CarryTermsInput {
  investmentId: number;
}

/** Carry worked out from one set of proceeds. Null figures mean there was nothing to compute proceeds from
 *  (no IC approval, or no current valuation mark), or the investment isn't qualified. */
export interface CarryFigures {
  /** Proceeds (projected exit, or stake value at the current mark) less cost, floored at zero. */
  profitUsd: number | null;
  hurdleAmountUsd: number | null;
  /** Profit above the hurdle, which carry is calculated on. */
  carriableProfitUsd: number | null;
  originationCarryUsd: number | null;
  monitoringCarryUsd: number | null;
  closureCarryUsd: number | null;
  totalCarryUsd: number | null;
}

/** One investment's carry, computed two ways from the same terms: what carry would be at the IC's assumed
 *  future exit, and what it would be if realized today at the latest known valuation (a closing or capital
 *  event) — there's no actual exit yet to compute a realized figure from. */
export interface InvestmentCarry {
  investmentId: number;
  companyName: string;
  terms: CarryTerms;
  projected: CarryFigures;
  current: CarryFigures;
}

// ---- Performance: the current position ----

/**
 * The de facto position. Once any closing exists it is built from closings only (basis CLOSING);
 * before that it shows the IC approval (basis IC). Exit assumptions always come from the latest IC version.
 */
export interface Position {
  investmentId: number;
  basis: 'CLOSING' | 'IC' | 'NONE';
  closingCount: number;
  lastCloseDate: string | null;
  investedUsd: number | null;
  expensesUsd: number | null;
  /** Invested plus expenses for closings; IC commitment before any closing. */
  costUsd: number | null;
  sharesHeld: number | null;
  ownershipPct: number | null;
  /** The company's valuation when NKSquared invested: the entry closing's post-money, or the IC's approved
   *  entry valuation before any closing. */
  entryValuationUsd: number | null;
  /** The company's most recently known valuation: the latest closing's post-money, or the same as
   *  entryValuationUsd before any closing. Only moves when a later closing or capital event records a new one. */
  currentValuationUsd: number | null;
  icVersion: number | null;
  icCommitmentUsd: number | null;
  undrawnCommitmentUsd: number | null;
  exitYear: number | null;
  exitValuationUsd: number | null;
  dilutionToExitPct: number | null;
  /** What the IC exit assumptions project at the assumed future exit. Always available once an IC approval exists. */
  projectedProceedsUsd: number | null;
  projectedMoic: number | null;
  projectedIrr: number | null;
  notes: string[];
}

// ---- Documents ----

export type DocumentCategory = 'IC_MEMO' | 'CLOSING' | 'CAPITAL_EVENT' | 'STATEMENT' | 'OTHER';

export interface DocumentInfo {
  id: number;
  /** Null while the file is uploaded but not yet saved with an investment. */
  investmentId: number | null;
  category: DocumentCategory;
  fileName: string;
  contentType: string;
  sizeBytes: number;
  sha256: string;
  /** What the file is evidence for, e.g. recordType 'IC_CASE' with that IC case's id. */
  recordType: string | null;
  recordId: number | null;
  uploadedBy: string | null;
  uploadedAt: string;
}

// ---- Intake (reading documents with Claude) ----

export interface IntakeStatus {
  configured: boolean;
  model: string;
  /** 'api' uses ANTHROPIC_API_KEY; 'claude-code' uses the Claude desktop app's sign-in (local testing only). */
  reader: 'api' | 'claude-code';
}

export interface ExtractedTranche {
  amountUsd: number | null;
  expectedDate: string | null;
  milestone: string | null;
}

export interface ExtractedFinancial {
  year: number | null;
  revenueUsd: number | null;
  ebitdaUsd: number | null;
}

/** Everything Claude could read from an IC memo. Every value can be null when the memo doesn't state it. */
export interface IcMemoExtraction {
  extractionId: number;
  documentId: number;
  model: string;
  investment: {
    companyName: string | null;
    businessSummary: string | null;
    sector: string | null;
    geography: string | null;
    instrument: string | null;
    dealLead: string | null;
    fiscalYearEndMonth: number | null;
  };
  icCase: {
    approvedOn: string | null;
    entryPostMoneyUsd: number | null;
    entryOwnershipPct: number | null;
    dilutionToExitPct: number | null;
    exitYear: number | null;
    exitValuationUsd: number | null;
    notes: string | null;
    tranches: ExtractedTranche[];
    financials: ExtractedFinancial[];
  };
  /** Returns as written in the memo, to compare with what the app calculates. */
  statedReturns: { irrPct: number | null; moic: number | null };
  currency: { memoCurrency: string | null; convertedToUsd: boolean; fxNote: string | null };
  sources: { field: string; page: number | null; quote: string }[];
  warnings: string[];
}

export interface ExtractedClosing {
  closeDate: string | null;
  trancheNumber: number | null;
  securityClass: string | null;
  sharesAllotted: number | null;
  pricePerShareUsd: number | null;
  amountInvestedUsd: number | null;
  originalCurrency: string | null;
  originalAmount: number | null;
  originalPricePerShare: number | null;
  fxRateUsdPerUnit: number | null;
  postMoneyValuationUsd: number | null;
  fullyDilutedSharesAfter: number | null;
  ownershipPctAfter: number | null;
  notes: string | null;
  expenses: { category: ExpenseCategory; description: string | null; amountUsd: number | null }[];
}

/**
 * Everything Claude could read from closing documents. Every value can be null when not stated.
 * One document can cover more than one IC tranche (e.g. a combined allotment closed in stages but
 * recorded together); `closings` has one entry per tranche found, in the order they appear.
 */
export interface ClosingExtraction {
  extractionId: number;
  documentId: number;
  model: string;
  closings: ExtractedClosing[];
  sources: { field: string; page: number | null; quote: string }[];
  warnings: string[];
}

export interface ExtractedCapitalEvent {
  eventType: CapitalEventType | null;
  eventDate: string | null;
  sellingParty: string | null;
  buyingParty: string | null;
  securityClass: string | null;
  shares: number | null;
  pricePerShareUsd: number | null;
  totalConsiderationUsd: number | null;
  impliedValuationUsd: number | null;
  deadlineDate: string | null;
  notes: string | null;
}

/** Everything Claude could read from a capital-event source (an email or PDF notice). Every value can be null
 *  when not stated. `page` in sources is always null for emails, which have no pages. */
export interface CapitalEventExtraction {
  extractionId: number;
  documentId: number;
  model: string;
  capitalEvent: ExtractedCapitalEvent;
  sources: { field: string; page: number | null; quote: string }[];
  warnings: string[];
}

// ---- Lifecycle: create from an IC memo, delete everything ----

export interface CreateFromIcMemoRequest {
  documentId: number;
  investment: CreateInvestmentRequest;
  /** Null to save the investment and memo without recording the IC approval yet. */
  icCase: IcCaseInput | null;
}

export interface CreateFromIcMemoResponse {
  investment: Investment;
  icCase: IcCase | null;
  document: DocumentInfo;
}

export interface DeleteInvestmentRequest {
  /** Must match the company name, as a guard against deleting the wrong deal. */
  confirmCompanyName: string;
}

export interface DeleteInvestmentResult {
  investmentId: number;
  companyName: string;
  icCasesDeleted: number;
  closingsDeleted: number;
  documentsDeleted: number;
  bytesFreed: number;
  extractionsDeleted: number;
}
