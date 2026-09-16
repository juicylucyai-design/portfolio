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
