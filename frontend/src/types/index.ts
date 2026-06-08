export interface User {
  id: string;
  email: string;
  full_name: string;
  role: "admin" | "underwriter" | "reviewer" | "viewer";
}

export interface Case {
  id: string;
  case_ref: string;
  borrower_name: string;
  loan_amount_requested: number;
  loan_type: string;
  status: CaseStatus;
  risk_signals?: RiskSignals;
  created_at: string;
}

export type CaseStatus =
  | "created"
  | "documents_uploaded"
  | "parsing"
  | "parsed"
  | "generating_cam"
  | "cam_ready"
  | "under_review"
  | "approved"
  | "declined";

export interface RiskSignals {
  risk_grade: "A" | "B" | "C" | "D";
  recommendation: "approve" | "decline" | "refer";
  dscr?: number;
  bureau_score?: number;
  bounce_count_12m?: number;
  gst_bank_match_pct?: number;
  flags: RiskFlag[];
}

export interface RiskFlag {
  code: string;
  severity: "critical" | "high" | "medium" | "low";
  message: string;
  source: string;
}

export interface Document {
  id: string;
  doc_type: DocumentType;
  filename: string;
  parse_status: "pending" | "processing" | "completed" | "failed";
  extraction_confidence?: number;
  uploaded_at: string;
}

export type DocumentType =
  | "bank_statement"
  | "gst_return"
  | "itr"
  | "financial_statement"
  | "bureau_report"
  | "form_26as"
  | "kyc"
  | "other";

export interface CAMReport {
  id: string;
  case_id: string;
  version: number;
  executive_summary: string;
  borrower_profile: Record<string, unknown>;
  financial_analysis: FinancialAnalysis;
  banking_behaviour: BankingBehaviour;
  gst_compliance: GSTCompliance;
  bureau_summary: BureauSummary;
  risk_flags: RiskFlag[];
  proposed_structure: ProposedStructure;
  recommendation: "approve" | "decline" | "refer";
  recommendation_rationale: string;
  generated_at: string;
}

export interface FinancialYear {
  year: string;
  revenue: number;
  ebitda: number;
  ebitda_margin_pct: number;
  pat: number;
  net_margin_pct: number;
  total_debt: number;
  net_worth: number;
  current_ratio: number;
  debt_equity_ratio: number;
  dscr: number;
  interest_coverage: number;
  debtor_days: number;
  creditor_days: number;
}

export interface FinancialAnalysis {
  years: FinancialYear[];
}

export interface BankingBehaviour {
  bank_name: string;
  period_from: string;
  period_to: string;
  total_credits_12m: number;
  average_monthly_credit: number;
  average_eod_balance: number;
  bounce_count_12m: number;
  emi_obligations_monthly: number;
  cash_withdrawal_pct: number;
  commentary: string;
  monthly_summaries: Array<{
    month: string; credits: number; debits: number;
    closing_balance: number; bounces: number;
  }>;
}

export interface GSTCompliance {
  gstin: string;
  annual_turnover: number;
  average_monthly_turnover: number;
  filing_regularity_pct: number;
  missing_periods: string[];
  gst_bank_match_pct?: number;
  commentary: string;
}

export interface BureauSummary {
  bureau: string;
  score: number;
  total_active_accounts: number;
  total_exposure: number;
  worst_dpd: number;
  written_off: boolean;
  suit_filed: boolean;
  enquiries_6m: number;
  commentary: string;
  accounts: Array<{
    type: string; lender: string; balance: number;
    emi: number; status: string; worst_dpd: number;
  }>;
}

export interface ProposedStructure {
  loan_amount: number;
  loan_type: string;
  tenor_months: number;
  suggested_rate_range: string;
  recommended_covenants: string[];
}
