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
  sector?: string | null;
  geography?: string | null;
  fiscalYearEndMonth: number;
  instrument: string;
  dealLead?: string | null;
}

// ---- IC Case ----

export interface IcTrancheInput {
  amountUsd: number;
  expectedDate: string; // YYYY-MM-DD
  milestone?: string | null;
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
}

export interface IcCaseSummary {
  investmentId: number;
  version: number;
  commitmentUsd: number;
  projectedProceedsUsd: number;
  projectedMoic: number;
  projectedIrr: number | null;
  exitYear: number;
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
}

export interface ExtractedTranche {
  amountUsd: number | null;
  expectedDate: string | null;
  milestone: string | null;
}

/** Everything Claude could read from an IC memo. Every value can be null when the memo doesn't state it. */
export interface IcMemoExtraction {
  extractionId: number;
  documentId: number;
  model: string;
  investment: {
    companyName: string | null;
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
  };
  /** Returns as written in the memo, to compare with what the app calculates. */
  statedReturns: { irrPct: number | null; moic: number | null };
  currency: { memoCurrency: string | null; convertedToUsd: boolean; fxNote: string | null };
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
  documentsDeleted: number;
  bytesFreed: number;
  extractionsDeleted: number;
}
