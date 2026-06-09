import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import {
  ArrowLeft, Shield, Landmark, TrendingUp, FileText,
  ClipboardCheck, Scale, Gavel, Calculator, AlertTriangle, CheckCircle2,
  XCircle, User, Package, FileBarChart, ChevronDown, ChevronRight,
  IndianRupee, Percent, Clock, Building2, Search, FileCheck,
  Receipt, BookOpen, Briefcase, PenLine, Phone, Target,
  Wrench, Home, BarChart3, AlertOctagon, PiggyBank, CreditCard, Banknote,
} from "lucide-react";
import api, { formatCrore } from "../utils/api";
import EditableField from "../components/cam/EditableField";
import MetricCard from "../components/cam/MetricCard";
import DataTable, { Column } from "../components/cam/DataTable";

/* ═══════════════════════════════════════════ TABS ═══════════════════════════════════════════ */

const TABS = [
  { id: "overview", label: "Overview", icon: TrendingUp },
  { id: "demographic", label: "Demographic", icon: User },
  { id: "bureau", label: "Bureau & Credit", icon: Shield },
  { id: "banking", label: "Banking", icon: Landmark },
  { id: "additional_credit", label: "Addl. Credit Checks", icon: Search },
  { id: "gst", label: "GST", icon: Receipt },
  { id: "itr", label: "ITR", icon: FileCheck },
  { id: "company_financials", label: "Company Financials", icon: Building2 },
  { id: "aip", label: "Income (AIP)", icon: Calculator },
  { id: "pd_notes", label: "PD Notes", icon: PenLine },
  { id: "reference_checks", label: "Reference Checks", icon: Phone },
  { id: "loan_purpose", label: "Loan Purpose", icon: Target },
  { id: "stock_details", label: "Stock Details", icon: Package },
  { id: "plant_machinery", label: "Plant & Machinery", icon: Wrench },
  { id: "property_details", label: "Property Details", icon: Home },
  { id: "scorecard", label: "Scorecard", icon: BarChart3 },
  { id: "deviations", label: "Deviations", icon: AlertOctagon },
  { id: "interest_rate", label: "Interest Rate", icon: Percent },
  { id: "eligibility", label: "Eligibility", icon: Scale },
  { id: "sanction_conditions", label: "Sanction Conditions", icon: Gavel },
  { id: "psl_charges", label: "PSL & Charges", icon: CreditCard },
  { id: "disbursement", label: "Disbursement", icon: Banknote },
] as const;
type TabId = (typeof TABS)[number]["id"];

/* ─── Helpers ─── */
const fmt = (v: any) => {
  if (v == null || v === "" || v === "—") return "—";
  if (typeof v === "string" && v.toLowerCase() === "reject") return "Reject";
  const n = typeof v === "number" ? v : parseFloat(v);
  if (isNaN(n)) return String(v);
  return formatCrore(n);
};
const pct = (v: any) => {
  if (v == null || v === "" || v === 0) return "—";
  const n = typeof v === "number" ? v : parseFloat(v);
  if (isNaN(n)) return String(v);
  return n < 1 ? `${(n * 100).toFixed(1)}%` : `${n.toFixed(1)}%`;
};
const scoreColor = (score: any) => {
  const n = typeof score === "number" ? score : parseInt(score);
  if (isNaN(n)) return "text-gray-700 bg-gray-50";
  if (n >= 750) return "text-green-700 bg-green-50";
  if (n >= 650) return "text-blue-700 bg-blue-50";
  return "text-red-700 bg-red-50";
};
const riskBandColor = (band: string) => {
  if (!band) return "bg-gray-100 text-gray-800 border-gray-300";
  const b = band.toUpperCase();
  if (b.includes("LOW") || b === "A") return "bg-green-100 text-green-800 border-green-300";
  if (b.includes("MEDIUM") || b === "B") return "bg-yellow-100 text-yellow-800 border-yellow-300";
  return "bg-red-100 text-red-800 border-red-300";
};

const Section = ({ title, children, className = "", collapsible = false }: { title: string; children: React.ReactNode; className?: string; collapsible?: boolean }) => {
  const [open, setOpen] = useState(true);
  return (
    <div className={`bg-white border border-gray-100 rounded-xl p-5 shadow-sm ${className}`}>
      <h3
        className={`font-bold text-gray-900 text-sm border-b border-gray-100 pb-2.5 mb-4 flex items-center gap-1.5 ${collapsible ? "cursor-pointer select-none" : ""}`}
        onClick={collapsible ? () => setOpen(!open) : undefined}
      >
        {collapsible && (open ? <ChevronDown size={14} /> : <ChevronRight size={14} />)}
        {title}
      </h3>
      {open && children}
    </div>
  );
};

const KV = ({ label, value, mono }: { label: string; value: any; mono?: boolean }) => (
  <div className="flex justify-between items-center py-1.5 border-b border-gray-50 last:border-0">
    <span className="text-xs text-gray-500">{label}</span>
    <span className={`text-xs font-semibold text-gray-900 ${mono ? "font-mono" : ""}`}>{String(value ?? "—")}</span>
  </div>
);

/* ─── RawGridTable: renders _raw_grid from any sheet ─── */
function RawGridTable({ grid, onCellSave }: { grid: any; onCellSave?: (rowIdx: number, key: string, value: any) => Promise<void> }) {
  const [editingCell, setEditingCell] = useState<{ row: number; col: number; value: any } | null>(null);
  const [saving, setSaving] = useState(false);
  const [modifiedCells, setModifiedCells] = useState<Set<string>>(new Set());

  if (!grid || !grid.headers || !grid.rows) return <p className="text-sm text-gray-400 italic">No grid data available.</p>;

  const headers: string[] = grid.headers;
  const rows: any[] = grid.rows;

  const handleSave = async () => {
    if (!editingCell || !onCellSave) return;
    setSaving(true);
    try {
      await onCellSave(editingCell.row, String(editingCell.col), editingCell.value);
      setModifiedCells((prev) => new Set(prev).add(`${editingCell.row}-${editingCell.col}`));
      setEditingCell(null);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-200">
            {headers.map((h, i) => (
              <th key={i} className="py-1.5 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wider text-left whitespace-nowrap">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row: any, rIdx: number) => {
            const cells: any[] = row.cells ?? [];
            return (
              <tr key={rIdx} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
                {cells.map((cell: any, cIdx: number) => {
                  const isEditable = cell.editable === true;
                  const isEditing = editingCell?.row === rIdx && editingCell?.col === cIdx;
                  const isModified = modifiedCells.has(`${rIdx}-${cIdx}`);
                  const cellVal = cell.value ?? "";

                  if (isEditing) {
                    return (
                      <td key={cIdx} className="py-1.5 px-1.5">
                        <div className="flex items-center gap-1">
                          <input
                            type="text"
                            value={editingCell.value ?? ""}
                            onChange={(e) => setEditingCell({ ...editingCell, value: e.target.value })}
                            className="w-full rounded border border-yellow-400 bg-yellow-50 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-yellow-400"
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleSave();
                              if (e.key === "Escape") setEditingCell(null);
                            }}
                          />
                          <button onClick={handleSave} disabled={saving} className="p-0.5 text-green-600 hover:bg-green-50 rounded">
                            <CheckCircle2 size={12} />
                          </button>
                          <button onClick={() => setEditingCell(null)} className="p-0.5 text-red-500 hover:bg-red-50 rounded">
                            <XCircle size={12} />
                          </button>
                        </div>
                      </td>
                    );
                  }

                  if (isEditable) {
                    return (
                      <td
                        key={cIdx}
                        className="py-1.5 px-3 text-xs cursor-pointer group"
                        onClick={() => setEditingCell({ row: rIdx, col: cIdx, value: cellVal })}
                      >
                        <span className="inline-flex items-center gap-1 rounded bg-yellow-50 border border-yellow-200 px-2 py-0.5 hover:border-yellow-400 transition">
                          {isModified && <span className="w-1.5 h-1.5 rounded-full bg-blue-500 flex-shrink-0" />}
                          <span className="font-mono">{String(cellVal)}</span>
                          <PenLine size={10} className="text-yellow-500 opacity-0 group-hover:opacity-100 transition" />
                        </span>
                      </td>
                    );
                  }

                  return (
                    <td key={cIdx} className="py-1.5 px-3 text-xs font-mono text-gray-900 bg-gray-50/30">
                      {String(cellVal)}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ─── SheetSection: structured view with raw grid toggle ─── */
function SheetSection({ title, sheetData, children, onCellSave }: {
  title: string;
  sheetData?: any;
  children?: React.ReactNode;
  onCellSave?: (rowIdx: number, key: string, value: any) => Promise<void>;
}) {
  const [showRaw, setShowRaw] = useState(false);
  const hasRawGrid = sheetData?._raw_grid?.headers?.length > 0;
  const hasStructured = !!children;

  if (!hasRawGrid && !hasStructured) {
    return (
      <Section title={title}>
        <p className="text-sm text-gray-400 italic">No data available for this section.</p>
      </Section>
    );
  }

  if (!hasStructured && hasRawGrid) {
    return (
      <Section title={title}>
        <RawGridTable grid={sheetData._raw_grid} onCellSave={onCellSave} />
      </Section>
    );
  }

  return (
    <Section title={title}>
      {hasRawGrid && (
        <button
          onClick={() => setShowRaw(!showRaw)}
          className="text-xs text-blue-600 hover:text-blue-800 mb-3 flex items-center gap-1"
        >
          {showRaw ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          {showRaw ? "Hide raw data" : "Show raw data"}
        </button>
      )}
      {showRaw ? <RawGridTable grid={sheetData._raw_grid} onCellSave={onCellSave} /> : children}
    </Section>
  );
}

/* ═══════════════════════════════════════════ MAIN COMPONENT ═══════════════════════════════════════════ */

export default function CAMDetail() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<TabId>("overview");

  const { data: cam, isLoading, error } = useQuery({
    queryKey: ["cam-data", id],
    queryFn: () => api.get(`/cases/${id}/cam-data`).then((r) => r.data),
    enabled: !!id,
  });
  const patchMutation = useMutation({
    mutationFn: (payload: Record<string, any>) => api.patch(`/cases/${id}/cam-data`, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["cam-data", id] }),
  });
  const handleFieldSave = async (key: string, value: any) => {
    await patchMutation.mutateAsync({ [key]: value });
  };
  const handleCellSave = async (rowIdx: number, key: string, value: any) => {
    await patchMutation.mutateAsync({ [`${key}_${rowIdx}`]: value });
  };

  if (isLoading) return <div className="flex items-center justify-center h-96"><div className="animate-pulse text-gray-400">Loading CAM data...</div></div>;
  if (error || !cam) return <div className="flex flex-col items-center justify-center h-96 gap-3"><AlertTriangle className="text-red-400" size={32} /><p className="text-gray-600 text-sm">Failed to load CAM data</p><Link to={`/cases/${id}`} className="text-blue-600 text-sm hover:underline">Back to case</Link></div>;

  const d = cam as any;
  const out = d.output ?? {};
  const bureau = d.bureau ?? {};
  const sc = d.scorecard ?? {};
  const ir = d.interest_rate ?? {};

  const primaryBureau = bureau.scores?.find((s: any) => s.score != null);
  const bureauScore = primaryBureau?.score;

  const renderTab = () => {
    switch (activeTab) {
      case "overview": return <OverviewTab d={d} out={out} bureauScore={bureauScore} />;
      case "demographic": return <DemographicTab d={d} out={out} onCellSave={handleCellSave} />;
      case "bureau": return <BureauTab bureau={bureau} out={out} onCellSave={handleCellSave} />;
      case "banking": return <BankingTab d={d} out={out} onCellSave={handleCellSave} />;
      case "additional_credit": return <AdditionalCreditTab d={d} onCellSave={handleCellSave} />;
      case "gst": return <GSTTab d={d} out={out} onCellSave={handleCellSave} />;
      case "itr": return <ITRTab d={d} out={out} onCellSave={handleCellSave} />;
      case "company_financials": return <CompanyFinancialsTab d={d} out={out} onCellSave={handleCellSave} />;
      case "aip": return <AIPTab d={d} out={out} onFieldSave={handleFieldSave} onCellSave={handleCellSave} />;
      case "pd_notes": return <PDNotesTab d={d} onFieldSave={handleFieldSave} />;
      case "reference_checks": return <ReferenceChecksTab d={d} onCellSave={handleCellSave} />;
      case "loan_purpose": return <LoanPurposeTab d={d} onCellSave={handleCellSave} />;
      case "stock_details": return <StockDetailsTab d={d} onCellSave={handleCellSave} />;
      case "plant_machinery": return <PlantMachineryTab d={d} out={out} onCellSave={handleCellSave} />;
      case "property_details": return <PropertyDetailsTab d={d} out={out} onCellSave={handleCellSave} />;
      case "scorecard": return <ScorecardTab sc={sc} out={out} onCellSave={handleCellSave} />;
      case "deviations": return <DeviationsTab d={d} onCellSave={handleCellSave} />;
      case "interest_rate": return <InterestRateTab ir={ir} out={out} onFieldSave={handleFieldSave} onCellSave={handleCellSave} />;
      case "eligibility": return <EligibilityTab d={d} out={out} onCellSave={handleCellSave} />;
      case "sanction_conditions": return <SanctionConditionsTab d={d} onFieldSave={handleFieldSave} />;
      case "psl_charges": return <PSLChargesTab d={d} out={out} onCellSave={handleCellSave} />;
      case "disbursement": return <DisbursementTab d={d} onFieldSave={handleFieldSave} onCellSave={handleCellSave} />;
      default: return null;
    }
  };

  const applicantName = d.demographic?.applicant_name ?? out.applicant_name ?? "—";
  const businessName = d.demographic?.business_name ?? out.business_name ?? "";

  return (
    <div className="max-w-[1440px] mx-auto px-6 py-5">
      <Link to={`/cases/${id}`} className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 mb-4 transition"><ArrowLeft size={14} /> Back to case</Link>

      {/* Hero */}
      <div className="bg-gradient-to-r from-slate-900 to-slate-700 text-white rounded-xl p-6 mb-5">
        <div className="flex justify-between items-start">
          <div>
            <p className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-1">Credit Appraisal Memorandum</p>
            <h1 className="text-2xl font-bold">{applicantName}</h1>
            <p className="text-slate-300 text-sm mt-1">
              {fmt(out.requested_loan_amount ?? out.Final_Sanctioned_Amount)} · {out.requested_loan_type ?? "—"} · {businessName}
            </p>
          </div>
          <div className="text-right space-y-1">
            {(sc.risk_band ?? out.score_risk_band) && (
              <span className={`inline-block px-3 py-1 rounded-full text-xs font-bold border ${riskBandColor(sc.risk_band ?? out.score_risk_band)}`}>
                {sc.risk_band ?? out.score_risk_band}
              </span>
            )}
            {bureauScore && <p className="text-slate-300 text-xs mt-1">Bureau: {bureauScore}</p>}
            {(sc.total_score ?? out.total_score_obtained) && <p className="text-slate-400 text-xs">Score: {sc.total_score ?? out.total_score_obtained}</p>}
          </div>
        </div>
      </div>

      {/* Tabs - scrollable */}
      <div className="sticky top-0 z-20 bg-gray-50 border-b border-gray-200 -mx-6 px-6 mb-5">
        <div className="flex gap-0.5 overflow-x-auto py-1 scrollbar-thin">
          {TABS.map((t) => {
            const Icon = t.icon;
            const active = activeTab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition ${
                  active
                    ? "bg-white text-blue-700 shadow-sm border border-gray-200"
                    : "text-gray-500 hover:text-gray-700 hover:bg-white/50"
                }`}
              >
                <Icon size={13} />{t.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-5">{renderTab()}</div>
    </div>
  );
}

/* ═══════════════════════════════════════════ TAB COMPONENTS ═══════════════════════════════════════════ */

/* ─── 1. Overview ─── */
function OverviewTab({ d, out, bureauScore }: { d: any; out: any; bureauScore: any }) {
  const eligData = [
    { name: "Bank Acc", value: out.Eligibility_as_per_Bank_Account ?? 0 },
    { name: "GST", value: out.Eligibility_as_per_GST_Return ?? 0 },
    { name: "ITR", value: out.Eligibility_as_per_ITR ?? 0 },
    { name: "Income", value: out.Eligibility_as_per_Income_Assessment ?? 0 },
    { name: "Security", value: out.Eligibility_as_per_Security ?? 0 },
    { name: "Financials", value: out.Eligibility_as_per_Company_Financials ?? 0 },
  ];

  const sanctionedAmount = out.Final_Sanctioned_Amount;
  const finalRate = out.Final_Interest_Rate;
  const finalEMI = out.Final_Proposed_Loan;
  const finalTenure = out.Final_Tenure;
  const foir = out.Final_FOIR;

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <MetricCard label="Bureau Score" value={bureauScore ?? "—"} color={bureauScore >= 700 ? "green" : bureauScore >= 600 ? "blue" : "red"} icon={Shield} />
        <MetricCard label="FOIR" value={pct(foir)} color="blue" icon={Percent} />
        <MetricCard label="Loan Amount" value={fmt(sanctionedAmount)} color={sanctionedAmount === "Reject" ? "red" : "green"} icon={IndianRupee} />
        <MetricCard label="Interest Rate" value={finalRate != null ? `${(Number(finalRate) * 100).toFixed(1)}%` : "—"} color="yellow" icon={TrendingUp} />
        <MetricCard label="EMI" value={fmt(finalEMI)} color="gray" icon={Calculator} />
        <MetricCard label="Tenure" value={finalTenure ? `${finalTenure} mo` : "—"} color="gray" icon={Clock} />
      </div>

      <Section title="Eligibility Comparison">
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={eligData} barSize={32}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tickFormatter={(v) => fmt(v)} tick={{ fontSize: 10 }} width={80} />
              <Tooltip formatter={(v) => fmt(v as number)} />
              <Bar dataKey="value" fill="#3b82f6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Section>

      <Section title="Loan Structure Summary">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div><p className="text-xs text-gray-500">Recommended</p><p className="text-lg font-bold">{fmt(out.Recommended_Loan_Amount_as_per_Underwriter)}</p></div>
          <div><p className="text-xs text-gray-500">Sanctioned</p><p className="text-lg font-bold text-green-700">{fmt(sanctionedAmount)}</p></div>
          <div><p className="text-xs text-gray-500">Rate</p><p className="text-lg font-bold">{finalRate != null ? `${(Number(finalRate) * 100).toFixed(2)}%` : "—"}</p></div>
          <div><p className="text-xs text-gray-500">EMI</p><p className="text-lg font-bold">{fmt(finalEMI)}</p></div>
          <div><p className="text-xs text-gray-500">Program</p><p className="text-lg font-bold text-blue-700">{out.Income_Program_for_Eligbility ?? "—"}</p></div>
        </div>
      </Section>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Section title="Banking">
          <KV label="Avg Bank Balance" value={fmt(out.combined_average_bank_balance)} />
          <KV label="Bank Turnover" value={fmt(out.combined_bto)} />
          <KV label="Bank Accounts" value={out.number_of_bank_accounts} />
        </Section>
        <Section title="Obligations">
          <KV label="Total EMI (All)" value={fmt(out.Total_existing_EMI_of_All_loans)} />
          <KV label="Obligated EMI" value={fmt(out.total_obligated_EMI)} />
          <KV label="ABB/EMI Ratio" value={out["Final_ABB/EMI_ratio"] ?? "—"} />
        </Section>
        <Section title="GST">
          <KV label="Annual GST Turnover" value={out.Annual_gst_turnover} />
          <KV label="Filing Frequency" value={out.gst_filing_frequency} />
          <KV label="GST Status" value={out.GST_status} />
        </Section>
        <Section title="Business">
          <KV label="Nature" value={out.Nature_of_business} />
          <KV label="Constitution" value={out.business_constitution} />
          <KV label="Business Type" value={out.business_type} />
        </Section>
      </div>
    </>
  );
}

/* ─── 2. Demographic ─── */
function DemographicTab({ d, out, onCellSave }: { d: any; out: any; onCellSave: any }) {
  const demo = d.demographic ?? {};
  const hasRawGrid = demo._raw_grid?.headers?.length > 0;

  return (
    <>
      <SheetSection title="Loan Application Details" sheetData={demo} onCellSave={onCellSave}>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <Section title="Applicant Details">
            <KV label="Name" value={demo.applicant_name ?? out.applicant_name} />
            <KV label="Age" value={demo.age ?? out.age} />
            <KV label="Date of Birth" value={demo.dob} />
            <KV label="Mobile" value={demo.mobile} mono />
            <KV label="Email" value={demo.email} />
            <KV label="Occupation" value={demo.occupation} />
            <KV label="Current Address" value={demo.current_address} />
            <KV label="Permanent Address" value={demo.permanent_address} />
          </Section>
          <Section title="Business Details">
            <KV label="Business Name" value={demo.business_name ?? out.business_name} />
            <KV label="Constitution" value={demo.constitution ?? out.business_constitution} />
            <KV label="Nature of Business" value={demo.nature_of_business ?? out.Nature_of_business} />
            <KV label="Business Type" value={demo.business_type ?? out.business_type} />
            <KV label="Enterprise Type" value={demo.enterprise_type} />
            <KV label="PAN" value={demo.pan} mono />
            <KV label="PAN Status" value={demo.pan_status} />
            <KV label="GSTIN" value={demo.gstin} mono />
            <KV label="Udyam Number" value={demo.udyam_number} mono />
            <KV label="Business Address" value={typeof demo.business_address === "object" ? JSON.stringify(demo.business_address) : demo.business_address} />
          </Section>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mt-5">
          <Section title="Co-Borrower">
            <KV label="Name" value={demo.co_borrower_name} />
            <KV label="Relationship" value={demo.co_borrower_relationship ?? out["co-borrower_relationship"]} />
            <KV label="Age" value={demo.co_borrower_age} />
            <KV label="PAN" value={demo.co_borrower_pan} mono />
            <KV label="Occupation" value={demo.co_borrower_occupation} />
          </Section>
          <Section title="Co-Applicant">
            <KV label="Name" value={demo.co_applicant_name} />
            <KV label="Relationship" value={demo.co_applicant_relationship ?? out["co-applicant_relationship"]} />
            <KV label="Age" value={demo.co_applicant_age} />
            <KV label="PAN" value={demo.co_applicant_pan} mono />
            <KV label="Occupation" value={demo.co_applicant_occupation} />
          </Section>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mt-5">
          <Section title="Loan Request">
            <KV label="Requested Amount" value={fmt(out.requested_loan_amount ?? demo.requested_amount)} />
            <KV label="Loan Type" value={out.requested_loan_type ?? demo.loan_type} />
            <KV label="Loan Purpose" value={demo.loan_purpose} />
            <KV label="Primary Security" value={demo.primary_security} />
            <KV label="Secondary Security" value={demo.secondary_security} />
          </Section>
          <Section title="Branch & Application">
            <KV label="Branch" value={demo.branch ?? out.sourcing_branch} />
            <KV label="Application ID" value={demo.app_id} mono />
            <KV label="Applied Date" value={demo.applied_date} />
            <KV label="CAM ID" value={demo.cam_id} mono />
          </Section>
        </div>
      </SheetSection>
    </>
  );
}

/* ─── 3. Bureau & Credit ─── */
function BureauTab({ bureau, out, onCellSave }: { bureau: any; out: any; onCellSave: any }) {
  const scores = bureau.scores?.filter((s: any) => s.name || s.score) ?? [];
  const loans = bureau.existing_loans ?? [];
  const commercial = bureau.commercial_bureau;

  const loanCols: Column[] = [
    { key: "borrower", header: "Borrower" },
    { key: "financier", header: "Financier" },
    { key: "loan_type", header: "Type" },
    { key: "amount", header: "Amount", align: "right", format: fmt },
    { key: "pos", header: "POS", align: "right", format: fmt },
    { key: "term", header: "Term" },
    { key: "mob", header: "MOB" },
    { key: "emi_assessed", header: "EMI Assessed", align: "right", format: fmt, editable: true, type: "number" },
    { key: "obligated", header: "Obligated", render: (r) => r.obligated === true || r.obligated === "True" ? <CheckCircle2 size={14} className="text-green-600" /> : <XCircle size={14} className="text-gray-300" /> },
  ];

  return (
    <>
      <SheetSection title="Bureau Scores" sheetData={bureau} onCellSave={onCellSave}>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {scores.map((s: any, i: number) => (
            <div key={i} className="border rounded-lg p-4 flex justify-between items-center">
              <div>
                <p className="text-xs font-semibold text-gray-700">{s.type} – {s.name}</p>
                <p className="text-xs text-gray-400 mt-0.5">{s.provider} · {s.fetch_date}</p>
                {s.ntc_flag && <span className="text-[10px] bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded mt-1 inline-block">NTC</span>}
              </div>
              {s.score != null ? (
                <span className={`text-lg font-bold px-3 py-1 rounded-lg ${scoreColor(s.score)}`}>{s.score}</span>
              ) : (
                <span className="text-sm text-gray-300">—</span>
              )}
            </div>
          ))}
        </div>
      </SheetSection>

      <div className="grid grid-cols-3 gap-3">
        <MetricCard label="Total EMI (All)" value={fmt(out.Total_existing_EMI_of_All_loans)} color="red" icon={Calculator} />
        <MetricCard label="Obligated EMI" value={fmt(out.total_obligated_EMI)} color="yellow" icon={Calculator} />
        <MetricCard label="Commercial Bureau" value={out.Commercial_bureau_score ?? commercial?.score ?? "NA"} color="gray" icon={Shield} />
      </div>

      {loans.length > 0 && (
        <Section title={`Existing Loans (${loans.length})`}>
          <DataTable columns={loanCols} data={loans} onCellSave={onCellSave} compact />
        </Section>
      )}
    </>
  );
}

/* ─── 4. Banking ─── */
function BankingTab({ d, out, onCellSave }: { d: any; out: any; onCellSave: any }) {
  const banking = d.banking ?? {};
  const accounts = banking.accounts ?? [];
  const monthlyData = banking.monthly_data ?? [];

  const monthlyCols: Column[] = [
    { key: "month", header: "Month" },
    { key: "credits", header: "Credits", align: "right", format: fmt },
    { key: "debits", header: "Debits", align: "right", format: fmt },
    { key: "balance", header: "Avg Balance", align: "right", format: fmt },
    { key: "inward_bounces", header: "Inward Bounces", align: "right" },
    { key: "outward_bounces", header: "Outward Bounces", align: "right" },
  ];

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard label="Bank Accounts" value={out.number_of_bank_accounts ?? "—"} color="blue" icon={Landmark} />
        <MetricCard label="Avg Bank Balance" value={fmt(out.combined_average_bank_balance)} color="blue" icon={IndianRupee} />
        <MetricCard label="Bank Turnover" value={fmt(out.combined_bto)} color="green" icon={TrendingUp} />
        <MetricCard label="Net Business Credits" value={out.combined_net_business_credits ?? "—"} color="gray" icon={FileText} />
      </div>

      {accounts.length > 0 && (
        <Section title="Bank Account Summaries">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {accounts.map((acc: any, i: number) => (
              <div key={i} className="border rounded-lg p-4">
                <p className="text-sm font-bold text-gray-900 mb-2">{acc.bank_name ?? `Account ${i + 1}`}</p>
                <KV label="Account No" value={acc.account_number} mono />
                <KV label="Account Type" value={acc.account_type} />
                <KV label="Avg Balance" value={fmt(acc.average_balance)} />
                <KV label="Total Credits" value={fmt(acc.total_credits)} />
                <KV label="Total Debits" value={fmt(acc.total_debits)} />
                <KV label="Inward Bounces" value={acc.inward_bounces} />
                <KV label="Outward Bounces" value={acc.outward_bounces} />
              </div>
            ))}
          </div>
        </Section>
      )}

      {monthlyData.length > 0 && (
        <Section title="Monthly Banking Data">
          <DataTable columns={monthlyCols} data={monthlyData} onCellSave={onCellSave} compact />
        </Section>
      )}

      <SheetSection title="Banking Eligibility" sheetData={banking} onCellSave={onCellSave}>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <KV label="Eligibility (Bank Account)" value={fmt(out.Eligibility_as_per_Bank_Account)} />
          <KV label="Max Eligibility (FOIR)" value={fmt(out.Maximum_Eligibility_as_per_FOIR)} />
          <KV label="FOIR" value={pct(out.Final_FOIR)} />
          <KV label="ABB/EMI Ratio" value={out["Final_ABB/EMI_ratio"] ?? "—"} />
        </div>
      </SheetSection>
    </>
  );
}

/* ─── 5. Additional Credit Checks ─── */
function AdditionalCreditTab({ d, onCellSave }: { d: any; onCellSave: any }) {
  const acc = d.additional_credit_checks ?? {};
  const rfa = acc.rfa ?? {};
  const dedupe = acc.dedupe ?? {};
  const googleCheck = acc.google_check ?? {};

  return (
    <>
      <SheetSection title="Additional Credit Checks" sheetData={acc} onCellSave={onCellSave}>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <Section title="RFA (Request for Approval)">
            {Object.entries(rfa).filter(([k]) => !k.startsWith("_")).length > 0 ? (
              Object.entries(rfa).filter(([k]) => !k.startsWith("_")).map(([k, v]) => (
                <KV key={k} label={k.replace(/_/g, " ")} value={v as any} />
              ))
            ) : (
              <p className="text-sm text-gray-400 italic">No RFA data</p>
            )}
          </Section>
          <Section title="Dedupe Check">
            {Object.entries(dedupe).filter(([k]) => !k.startsWith("_")).length > 0 ? (
              Object.entries(dedupe).filter(([k]) => !k.startsWith("_")).map(([k, v]) => (
                <KV key={k} label={k.replace(/_/g, " ")} value={v as any} />
              ))
            ) : (
              <p className="text-sm text-gray-400 italic">No dedupe data</p>
            )}
          </Section>
          <Section title="Google Check">
            {Object.entries(googleCheck).filter(([k]) => !k.startsWith("_")).length > 0 ? (
              Object.entries(googleCheck).filter(([k]) => !k.startsWith("_")).map(([k, v]) => (
                <KV key={k} label={k.replace(/_/g, " ")} value={v as any} />
              ))
            ) : (
              <p className="text-sm text-gray-400 italic">No Google check data</p>
            )}
          </Section>
        </div>
      </SheetSection>
    </>
  );
}

/* ─── 6. GST ─── */
function GSTTab({ d, out, onCellSave }: { d: any; out: any; onCellSave: any }) {
  const gst = d.gst ?? {};
  const manual = gst.manual_pull ?? {};
  const filings = (gst.monthly_filings ?? []).filter((f: any) => {
    const m = String(f.month ?? "").trim();
    return m && !m.includes("Amount") && m !== "0" && m !== "00:00:00" && m !== "Total";
  });
  const filingCols: Column[] = [
    { key: "month", header: "Month" },
    { key: "fy", header: "FY" },
    { key: "amount", header: "Amount (₹)", align: "right", format: fmt, editable: true, type: "number" },
    { key: "source", header: "Source", render: (r: any) => r.source === "manual" ? <span className="text-[10px] bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded">Manual</span> : <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">Auto</span> },
  ];

  return (
    <SheetSection title="GST Details" sheetData={gst} onCellSave={onCellSave}>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3"><p className="text-[10px] text-yellow-600 uppercase font-semibold">GSTIN</p><p className="text-sm font-bold text-gray-900">{manual.gstin ?? gst.gstin ?? "—"}</p></div>
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3"><p className="text-[10px] text-yellow-600 uppercase font-semibold">Status</p><p className="text-sm font-bold text-gray-900">{manual.status ?? out.GST_status ?? "—"}</p></div>
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3"><p className="text-[10px] text-yellow-600 uppercase font-semibold">Latest Month</p><p className="text-sm font-bold text-gray-900">{manual.latest_month ?? out.latest_gst_filed_month ?? "—"}</p></div>
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3"><p className="text-[10px] text-yellow-600 uppercase font-semibold">Frequency</p><p className="text-sm font-bold text-gray-900">{manual.frequency ?? out.gst_filing_frequency ?? "—"}</p></div>
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-3"><p className="text-[10px] text-gray-500 uppercase font-semibold">Annual Turnover</p><p className="text-sm font-bold text-gray-900">{out.Annual_gst_turnover ?? "—"}</p></div>
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-3"><p className="text-[10px] text-gray-500 uppercase font-semibold">Eligibility (GST)</p><p className="text-sm font-bold text-gray-900">{fmt(out.Eligibility_as_per_GST_Return)}</p></div>
      </div>
      {filings.length > 0 ? (
        <DataTable columns={filingCols} data={filings} onCellSave={onCellSave} compact />
      ) : (
        <p className="text-sm text-gray-400 italic">No GST filing data available.</p>
      )}
    </SheetSection>
  );
}

/* ─── 7. ITR ─── */
function ITRTab({ d, out, onCellSave }: { d: any; out: any; onCellSave: any }) {
  const itr = d.itr ?? {};

  return (
    <SheetSection title="Income Tax Returns" sheetData={itr} onCellSave={onCellSave}>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
          <p className="text-[10px] text-gray-500 uppercase font-semibold">ITR Income (Prev Year)</p>
          <p className="text-sm font-bold text-gray-900">{fmt(out.itr_income_previous_year ?? itr.income_previous_year)}</p>
        </div>
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
          <p className="text-[10px] text-gray-500 uppercase font-semibold">ITR Income (Curr Year)</p>
          <p className="text-sm font-bold text-gray-900">{fmt(out.itr_income_current_year ?? itr.income_current_year)}</p>
        </div>
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
          <p className="text-[10px] text-gray-500 uppercase font-semibold">Final ITR Considered</p>
          <p className="text-sm font-bold text-gray-900">{fmt(out.final_itr_income_considered ?? itr.final_income_considered)}</p>
        </div>
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
          <p className="text-[10px] text-gray-500 uppercase font-semibold">Eligibility (ITR)</p>
          <p className="text-sm font-bold text-gray-900">{fmt(out.Eligibility_as_per_ITR)}</p>
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Section title="Filing Details">
          <KV label="Filing Date (Prev)" value={itr.filing_date_previous ?? out.itr_filing_date_previous} />
          <KV label="Filing Date (Curr)" value={itr.filing_date_current ?? out.itr_filing_date_current} />
          <KV label="Assessment Year (Prev)" value={itr.ay_previous} />
          <KV label="Assessment Year (Curr)" value={itr.ay_current} />
          <KV label="ITR Type" value={itr.itr_type} />
          <KV label="Gross Total Income (Prev)" value={fmt(itr.gross_total_income_prev)} />
          <KV label="Gross Total Income (Curr)" value={fmt(itr.gross_total_income_curr)} />
        </Section>
        <Section title="Income Components">
          <KV label="Business Income (Prev)" value={fmt(itr.business_income_prev)} />
          <KV label="Business Income (Curr)" value={fmt(itr.business_income_curr)} />
          <KV label="Salary Income (Prev)" value={fmt(itr.salary_income_prev)} />
          <KV label="Salary Income (Curr)" value={fmt(itr.salary_income_curr)} />
          <KV label="Other Income (Prev)" value={fmt(itr.other_income_prev)} />
          <KV label="Other Income (Curr)" value={fmt(itr.other_income_curr)} />
        </Section>
      </div>
    </SheetSection>
  );
}

/* ─── 8. Company Financials ─── */
function CompanyFinancialsTab({ d, out, onCellSave }: { d: any; out: any; onCellSave: any }) {
  const fin = d.company_financials ?? d.financials ?? {};

  return (
    <SheetSection title="Company Financials" sheetData={fin} onCellSave={onCellSave}>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Section title="Balance Sheet">
          <div className="grid grid-cols-2 gap-x-6">
            <p className="text-xs font-semibold text-gray-400 uppercase pb-1 border-b border-gray-100">Previous Year</p>
            <p className="text-xs font-semibold text-gray-400 uppercase pb-1 border-b border-gray-100">Current Year</p>
          </div>
          <KV label="Current Assets (Prev)" value={fmt(out.current_assets_previous_year ?? fin.current_assets_prev)} />
          <KV label="Current Assets (Curr)" value={fmt(out.current_assets_current_year ?? fin.current_assets_curr)} />
          <KV label="Non-Current Assets (Prev)" value={fmt(out.non_current_assets_previous_year ?? fin.non_current_assets_prev)} />
          <KV label="Non-Current Assets (Curr)" value={fmt(out.non_current_assets_current_year ?? fin.non_current_assets_curr)} />
          <KV label="Current Liabilities (Prev)" value={fmt(out.current_liabilities_previous_year ?? fin.current_liabilities_prev)} />
          <KV label="Current Liabilities (Curr)" value={fmt(out.current_liabilities_current_year ?? fin.current_liabilities_curr)} />
          <KV label="Capital (Prev)" value={fmt(out.capital_previous_year ?? fin.capital_prev)} />
          <KV label="Capital (Curr)" value={fmt(out.capital_current_year ?? fin.capital_curr)} />
          <KV label="Net Worth (Prev)" value={fmt(fin.net_worth_prev)} />
          <KV label="Net Worth (Curr)" value={fmt(fin.net_worth_curr)} />
        </Section>
        <Section title="Profit & Loss">
          <KV label="Type Financials (Prev)" value={out.type_of_financials_previous_year ?? fin.type_prev} />
          <KV label="Type Financials (Curr)" value={out.type_of_financials_current_year ?? fin.type_curr} />
          <KV label="Turnover (Prev)" value={fmt(out.turnover_previous_year ?? fin.turnover_prev)} />
          <KV label="Turnover (Curr)" value={fmt(out.turnover_current_year ?? fin.turnover_curr)} />
          <KV label="Gross Profit (Prev)" value={fmt(out.gross_profit_previous_year ?? fin.gross_profit_prev)} />
          <KV label="Gross Profit (Curr)" value={fmt(out.gross_profit_current_year ?? fin.gross_profit_curr)} />
          <KV label="Net Profit (Prev)" value={fmt(fin.net_profit_prev)} />
          <KV label="Net Profit (Curr)" value={fmt(fin.net_profit_curr)} />
          <KV label="PAT (Prev)" value={fmt(out.profit_after_taxes_previous_year ?? fin.pat_prev)} />
          <KV label="PAT (Curr)" value={fmt(out.profit_after_taxes_current_year ?? fin.pat_curr)} />
          <KV label="Depreciation (Prev)" value={fmt(fin.depreciation_prev)} />
          <KV label="Depreciation (Curr)" value={fmt(fin.depreciation_curr)} />
          <KV label="Eligibility (Financials)" value={fmt(out.Eligibility_as_per_Company_Financials)} />
        </Section>
      </div>
    </SheetSection>
  );
}

/* ─── 9. Income Assessment (AIP) ─── */
function AIPTab({ d, out, onFieldSave, onCellSave }: { d: any; out: any; onFieldSave: any; onCellSave: any }) {
  const aip = d.aip ?? {};
  const pi = aip.primary_income ?? {};
  const bills = aip.bills ?? [];
  const secondary = aip.secondary_income ?? [];

  const billCols: Column[] = [
    { key: "bill_no", header: "Bill No" },
    { key: "date", header: "Date" },
    { key: "amount", header: "Amount", align: "right", format: fmt, editable: true, type: "number" },
  ];
  const secondaryCols: Column[] = [
    { key: "source", header: "Source" },
    { key: "type", header: "Type" },
    { key: "amount", header: "Amount", align: "right", format: fmt, editable: true, type: "number" },
    { key: "frequency", header: "Frequency" },
  ];

  return (
    <SheetSection title="Income Assessment (AIP)" sheetData={aip} onCellSave={onCellSave}>
      <Section title="Primary Income Assessment">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <MetricCard label="Bill Days" value={out.number_of_billcollected_days ?? pi.bill_days ?? "—"} color="gray" />
          <MetricCard label="Daily Sales" value={fmt(out.daily_sales ?? pi.daily_sales)} color="gray" />
          <MetricCard label="Monthly Sales" value={fmt(pi.monthly_sales)} color="blue" />
          <MetricCard label="Annual Sales" value={fmt(out.annual_assessed_sales ?? pi.annual_sales)} color="blue" />
          <MetricCard label="Margin" value={pct(out.business_margin_assessed ?? pi.margin)} color="yellow" />
          <MetricCard label="Net Income" value={fmt(out.annual_net_profit_aip_primary_income ?? pi.net_income)} color="green" />
        </div>
      </Section>
      {bills.length > 0 && (
        <Section title="Bills Collection">
          <DataTable columns={billCols} data={bills} onCellSave={onCellSave} compact />
        </Section>
      )}
      {secondary.length > 0 && (
        <Section title="Secondary Income">
          <DataTable columns={secondaryCols} data={secondary} onCellSave={onCellSave} compact />
        </Section>
      )}
      <Section title="Eligibility from Income">
        <KV label="Eligibility (Income Assessment)" value={fmt(out.Eligibility_as_per_Income_Assessment)} />
        <KV label="Income Program" value={out.Income_Program_for_Eligbility ?? "—"} />
      </Section>
    </SheetSection>
  );
}

/* ─── 10. PD Notes ─── */
function PDNotesTab({ d, onFieldSave }: { d: any; onFieldSave: any }) {
  const pd = d.pd_notes ?? {};
  const structuredFields = Object.entries(pd).filter(([k, v]) => v && !k.startsWith("_") && !k.startsWith("Notes"));
  const noteFields = Object.entries(pd).filter(([k]) => k.startsWith("Notes"));
  const hasRawGrid = pd._raw_grid?.headers?.length > 0;

  return (
    <>
      <Section title="PD Notes">
        {hasRawGrid && !structuredFields.length && !noteFields.length ? (
          <RawGridTable grid={pd._raw_grid} />
        ) : (
          <>
            <p className="text-xs text-yellow-600 mb-3">All fields in this section are editable (yellow background).</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {structuredFields.map(([k, v]) => (
                <EditableField key={k} label={k.replace(/_/g, " ")} value={v} fieldKey={`pd_notes.${k}`} onSave={onFieldSave} />
              ))}
            </div>
            <div className="grid grid-cols-1 gap-3 mt-3">
              {noteFields.map(([k, v]) => (
                <EditableField key={k} label={k.replace(/_/g, " ")} value={v} fieldKey={`pd_notes.${k}`} type="textarea" onSave={onFieldSave} />
              ))}
            </div>
            {structuredFields.length === 0 && noteFields.length === 0 && (
              <p className="text-sm text-gray-400 italic">No PD notes available.</p>
            )}
          </>
        )}
      </Section>
    </>
  );
}

/* ─── 11. Reference Checks ─── */
function ReferenceChecksTab({ d, onCellSave }: { d: any; onCellSave: any }) {
  const refs = d.reference_checks ?? {};
  const refList = Array.isArray(refs) ? refs : (refs.checks ?? refs.references ?? []);

  const refCols: Column[] = [
    { key: "name", header: "Name" },
    { key: "relation", header: "Relation" },
    { key: "phone", header: "Phone" },
    { key: "feedback", header: "Feedback", editable: true },
  ];

  const hasRawGrid = !Array.isArray(refs) && refs._raw_grid?.headers?.length > 0;

  return (
    <SheetSection title="Reference Checks" sheetData={Array.isArray(refs) ? undefined : refs} onCellSave={onCellSave}>
      {refList.length > 0 ? (
        <DataTable columns={refCols} data={refList} onCellSave={onCellSave} compact />
      ) : (
        <p className="text-sm text-gray-400 italic">No reference check data available.</p>
      )}
    </SheetSection>
  );
}

/* ─── 12. Loan Purpose ─── */
function LoanPurposeTab({ d, onCellSave }: { d: any; onCellSave: any }) {
  const lp = d.loan_purpose ?? {};
  const purposes = Array.isArray(lp) ? lp : (lp.purposes ?? lp.items ?? []);

  const purposeCols: Column[] = [
    { key: "sl_no", header: "#", width: "40px" },
    { key: "purpose", header: "Purpose", editable: true },
    { key: "details", header: "Details", editable: true },
    { key: "amount", header: "Amount", align: "right", format: fmt, editable: true, type: "number" },
  ];

  return (
    <SheetSection title="Loan Purpose" sheetData={Array.isArray(lp) ? undefined : lp} onCellSave={onCellSave}>
      {purposes.length > 0 ? (
        <DataTable columns={purposeCols} data={purposes} onCellSave={onCellSave} compact />
      ) : (
        <p className="text-sm text-gray-400 italic">No loan purpose data available.</p>
      )}
    </SheetSection>
  );
}

/* ─── 13. Stock Details ─── */
function StockDetailsTab({ d, onCellSave }: { d: any; onCellSave: any }) {
  const sd = d.stock_details ?? {};
  const stock = Array.isArray(sd) ? sd : (sd.items ?? sd.stock ?? []);
  const filteredStock = stock.filter((s: any) => s.sl_no !== "Total" && s.description !== null);
  const out = d.output ?? {};
  const totalStock = filteredStock.reduce((s: number, r: any) => s + (r.amount ?? 0), 0);

  const stockCols: Column[] = [
    { key: "sl_no", header: "#", width: "40px" },
    { key: "description", header: "Description", editable: true },
    { key: "quantity", header: "Qty", align: "right", editable: true, type: "number" },
    { key: "rate", header: "Rate (₹)", align: "right", format: fmt, editable: true, type: "number" },
    { key: "amount", header: "Amount (₹)", align: "right", format: fmt },
  ];

  return (
    <>
      <MetricCard label="Total Stock Security" value={fmt(out.Stock_security_amount_total ?? totalStock)} color="blue" icon={Package} className="mb-4" />
      <SheetSection title={`Stock Details (${filteredStock.length} items)`} sheetData={Array.isArray(sd) ? undefined : sd} onCellSave={onCellSave}>
        <p className="text-xs text-yellow-600 mb-3">All stock item fields are editable (yellow background).</p>
        {filteredStock.length > 0 ? (
          <DataTable
            columns={stockCols}
            data={filteredStock}
            onCellSave={onCellSave}
            compact
            footer={<tr className="bg-slate-50 font-bold"><td colSpan={4} className="px-3 py-2 text-xs text-right">Total Stock Value</td><td className="px-3 py-2 text-xs text-right font-mono">{fmt(totalStock)}</td></tr>}
          />
        ) : (
          <p className="text-sm text-gray-400 italic">No stock detail data available.</p>
        )}
      </SheetSection>
    </>
  );
}

/* ─── 14. Plant & Machinery ─── */
function PlantMachineryTab({ d, out, onCellSave }: { d: any; out: any; onCellSave: any }) {
  const pm = d.plant_machinery ?? {};
  const movable = pm.movable ?? pm.movable_pm ?? [];
  const vehicles = pm.vehicles ?? pm.vehicle_pm ?? [];

  const movableCols: Column[] = [
    { key: "sl_no", header: "#", width: "40px" },
    { key: "description", header: "Description" },
    { key: "make", header: "Make" },
    { key: "year", header: "Year" },
    { key: "value", header: "Value", align: "right", format: fmt },
  ];
  const vehicleCols: Column[] = [
    { key: "sl_no", header: "#", width: "40px" },
    { key: "description", header: "Description" },
    { key: "registration", header: "Reg. No" },
    { key: "make", header: "Make" },
    { key: "year", header: "Year" },
    { key: "value", header: "Value", align: "right", format: fmt },
  ];

  return (
    <>
      <div className="grid grid-cols-2 gap-3 mb-4">
        <MetricCard label="Movable P&M Value" value={fmt(out["Security_Value_Movable_P&M"])} color="gray" icon={Wrench} />
        <MetricCard label="Vehicle P&M Value" value={fmt(out["Security_Value_Vehicle_P&M"])} color="gray" icon={Scale} />
      </div>
      <SheetSection title="Plant & Machinery" sheetData={pm} onCellSave={onCellSave}>
        {(Array.isArray(movable) ? movable : []).length > 0 && (
          <Section title="Movable P&M">
            <DataTable columns={movableCols} data={movable} onCellSave={onCellSave} compact />
          </Section>
        )}
        {(Array.isArray(vehicles) ? vehicles : []).length > 0 && (
          <Section title="Vehicle Details" className="mt-4">
            <DataTable columns={vehicleCols} data={vehicles} onCellSave={onCellSave} compact />
          </Section>
        )}
        {(Array.isArray(movable) ? movable : []).length === 0 && (Array.isArray(vehicles) ? vehicles : []).length === 0 && (
          <p className="text-sm text-gray-400 italic">No plant & machinery data available.</p>
        )}
      </SheetSection>
    </>
  );
}

/* ─── 15. Property Details ─── */
function PropertyDetailsTab({ d, out, onCellSave }: { d: any; out: any; onCellSave: any }) {
  const prop = d.property_details ?? {};

  return (
    <SheetSection title="Property Details" sheetData={prop} onCellSave={onCellSave}>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <Section title="Property Information">
          <KV label="Property Type" value={prop.property_type} />
          <KV label="Property Address" value={prop.address} />
          <KV label="Area (sq ft)" value={prop.area} />
          <KV label="Market Value" value={fmt(prop.market_value)} />
          <KV label="Distress Value" value={fmt(prop.distress_value)} />
          <KV label="Realizable Value" value={fmt(prop.realizable_value)} />
          <KV label="Title Clear" value={prop.title_clear} />
          <KV label="Occupancy Status" value={prop.occupancy_status} />
        </Section>
        <Section title="Valuation & LTV">
          <KV label="Valuer Name" value={prop.valuer_name} />
          <KV label="Valuation Date" value={prop.valuation_date} />
          <KV label="Valuation Amount" value={fmt(prop.valuation_amount)} />
          <KV label="LTV (%)" value={pct(prop.ltv ?? out.ltv)} />
          <KV label="Eligibility (Security)" value={fmt(out.Eligibility_as_per_Security)} />
          <KV label="Security Type" value={prop.security_type} />
          <KV label="Mortgage Type" value={prop.mortgage_type} />
        </Section>
      </div>
    </SheetSection>
  );
}

/* ─── 16. Scorecard ─── */
function ScorecardTab({ sc, out, onCellSave }: { sc: any; out: any; onCellSave: any }) {
  const params = sc.parameters ?? [];
  const paramCols: Column[] = [
    { key: "sr_no", header: "#", width: "40px" },
    { key: "parameter", header: "Parameter" },
    { key: "max_score", header: "Max", align: "right" },
    { key: "criteria", header: "Criteria", editable: true },
    { key: "score", header: "Score", align: "right" },
  ];

  return (
    <SheetSection title="Scorecard" sheetData={sc} onCellSave={onCellSave}>
      <div className="flex items-center gap-6 mb-4">
        <div className="text-center">
          <p className="text-3xl font-bold text-gray-900">{sc.total_score ?? out.total_score_obtained ?? "—"}</p>
          <p className="text-xs text-gray-500">Total Score</p>
        </div>
        {(sc.risk_band ?? out.score_risk_band) && (
          <span className={`px-4 py-2 rounded-full text-sm font-bold border ${riskBandColor(sc.risk_band ?? out.score_risk_band)}`}>
            {sc.risk_band ?? out.score_risk_band}
          </span>
        )}
      </div>
      {params.length > 0 ? (
        <DataTable columns={paramCols} data={params} onCellSave={onCellSave} compact />
      ) : (
        <p className="text-sm text-gray-400 italic">No scorecard parameters available.</p>
      )}
    </SheetSection>
  );
}

/* ─── 17. Deviations ─── */
function DeviationsTab({ d, onCellSave }: { d: any; onCellSave: any }) {
  const devData = d.deviations ?? {};
  const devs = Array.isArray(devData) ? devData : (devData.items ?? devData.deviations ?? []);

  const devCols: Column[] = [
    { key: "deviation", header: "Deviation" },
    { key: "description", header: "Description", editable: true },
    { key: "mitigants", header: "Mitigants", editable: true },
    { key: "approving_authority", header: "Authority" },
    {
      key: "approval_status",
      header: "Status",
      render: (r) => {
        const status = r.approval_status ?? "—";
        let cls = "bg-gray-100 text-gray-700";
        if (status === "Approved") cls = "bg-green-100 text-green-700";
        else if (status === "Pending") cls = "bg-yellow-100 text-yellow-700";
        else if (status === "Rejected") cls = "bg-red-100 text-red-700";
        return <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${cls}`}>{status}</span>;
      },
    },
    { key: "approved_by", header: "Approved By" },
    { key: "date", header: "Date" },
  ];

  return (
    <SheetSection title={`Deviations (${devs.length})`} sheetData={Array.isArray(devData) ? undefined : devData} onCellSave={onCellSave}>
      {devs.length > 0 ? (
        <DataTable columns={devCols} data={devs} onCellSave={onCellSave} compact />
      ) : (
        <p className="text-sm text-gray-400 italic">No deviations recorded.</p>
      )}
    </SheetSection>
  );
}

/* ─── 18. Interest Rate ─── */
function InterestRateTab({ ir, out, onFieldSave, onCellSave }: { ir: any; out: any; onFieldSave: any; onCellSave: any }) {
  const finalRate = out.Final_Interest_Rate ?? ir.final_rate;
  const fields = Object.entries(ir).filter(([k]) => !k.startsWith("_"));

  return (
    <SheetSection title="Interest Rate Calculator" sheetData={ir} onCellSave={onCellSave}>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        {fields.map(([k, v]) => (
          <EditableField key={k} label={k.replace(/_/g, " ")} value={v} fieldKey={`interest_rate.${k}`} onSave={onFieldSave} />
        ))}
      </div>
      <div className="mt-4 bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-center justify-between">
        <span className="text-sm font-medium text-blue-800">Final Interest Rate</span>
        <span className="text-2xl font-bold text-blue-900">
          {finalRate != null ? `${(Number(finalRate) * 100).toFixed(2)}%` : "—"}
        </span>
      </div>
    </SheetSection>
  );
}

/* ─── 19. Eligibility ─── */
function EligibilityTab({ d, out, onCellSave }: { d: any; out: any; onCellSave: any }) {
  const eligInv = d.eligibility_inventory ?? {};
  const eligProp = d.eligibility_property ?? {};
  const eligibility = d.eligibility ?? {};

  const eligEntries = [
    { label: "Bank Account", value: out.Eligibility_as_per_Bank_Account },
    { label: "GST Return", value: out.Eligibility_as_per_GST_Return },
    { label: "ITR", value: out.Eligibility_as_per_ITR },
    { label: "Company Financials", value: out.Eligibility_as_per_Company_Financials },
    { label: "Income Assessment", value: out.Eligibility_as_per_Income_Assessment },
    { label: "Max FOIR Eligibility", value: out.Maximum_Eligibility_as_per_FOIR },
    { label: "Security", value: out.Eligibility_as_per_Security },
    { label: "Recommended by Underwriter", value: out.Recommended_Loan_Amount_as_per_Underwriter },
    { label: "Final Sanctioned Amount", value: out.Final_Sanctioned_Amount },
  ];

  return (
    <>
      <Section title="Eligibility Summary">
        <div className="grid grid-cols-3 md:grid-cols-5 gap-3">
          {eligEntries.map((e) => (
            <div key={e.label} className="border rounded-lg p-2.5">
              <p className="text-[10px] text-gray-500 uppercase">{e.label}</p>
              <p className="text-sm font-bold text-gray-900">{fmt(e.value)}</p>
            </div>
          ))}
        </div>
      </Section>

      {(eligInv._raw_grid || Object.keys(eligInv).filter((k) => !k.startsWith("_")).length > 0) && (
        <SheetSection title="Eligibility - Inventory" sheetData={eligInv} onCellSave={onCellSave}>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Object.entries(eligInv).filter(([k]) => !k.startsWith("_")).map(([k, v]) => (
              <KV key={k} label={k.replace(/_/g, " ")} value={v as any} />
            ))}
          </div>
        </SheetSection>
      )}

      {(eligProp._raw_grid || Object.keys(eligProp).filter((k) => !k.startsWith("_")).length > 0) && (
        <SheetSection title="Eligibility - Property" sheetData={eligProp} onCellSave={onCellSave}>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Object.entries(eligProp).filter(([k]) => !k.startsWith("_")).map(([k, v]) => (
              <KV key={k} label={k.replace(/_/g, " ")} value={v as any} />
            ))}
          </div>
        </SheetSection>
      )}

      {(eligibility._raw_grid || Object.keys(eligibility).filter((k) => !k.startsWith("_")).length > 0) && (
        <SheetSection title="Eligibility - Detail" sheetData={eligibility} onCellSave={onCellSave}>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Object.entries(eligibility).filter(([k]) => !k.startsWith("_")).map(([k, v]) => (
              <KV key={k} label={k.replace(/_/g, " ")} value={v as any} />
            ))}
          </div>
        </SheetSection>
      )}
    </>
  );
}

/* ─── 20. Sanction Conditions ─── */
function SanctionConditionsTab({ d, onFieldSave }: { d: any; onFieldSave: any }) {
  const scData = d.sanction_conditions ?? {};
  const conditions = Array.isArray(scData) ? scData : (scData.conditions ?? scData.items ?? []);
  const hasRawGrid = !Array.isArray(scData) && scData._raw_grid?.headers?.length > 0;

  return (
    <Section title={`Sanction Conditions (${conditions.length})`}>
      {hasRawGrid && conditions.length === 0 ? (
        <RawGridTable grid={scData._raw_grid} />
      ) : (
        <>
          <p className="text-xs text-yellow-600 mb-3">All conditions are editable (yellow background).</p>
          <div className="space-y-2">
            {conditions.length > 0 ? conditions.map((c: any, i: number) => (
              <EditableField
                key={i}
                value={typeof c === "object" ? c.condition || c.value || JSON.stringify(c) : c}
                fieldKey={`sanction_conditions.${i}`}
                onSave={onFieldSave}
                className="w-full"
              />
            )) : (
              <p className="text-sm text-gray-400 italic">No sanction conditions.</p>
            )}
          </div>
        </>
      )}
    </Section>
  );
}

/* ─── 21. PSL & Charges ─── */
function PSLChargesTab({ d, out, onCellSave }: { d: any; out: any; onCellSave: any }) {
  const psl = d.psl ?? {};
  const charges = d.charges ?? {};
  const cgtmse = d.cgtmse ?? {};

  return (
    <>
      <SheetSection title="PSL Classification" sheetData={psl} onCellSave={onCellSave}>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Object.entries(psl).filter(([k]) => !k.startsWith("_")).length > 0 ? (
            Object.entries(psl).filter(([k]) => !k.startsWith("_")).map(([k, v]) => (
              <KV key={k} label={k.replace(/_/g, " ")} value={v as any} />
            ))
          ) : (
            <p className="text-sm text-gray-400 italic col-span-4">No PSL data available.</p>
          )}
        </div>
      </SheetSection>

      <Section title="Charges & Fees">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <KV label="Processing Fee" value={out.Processing_Fee ?? charges.processing_fee} />
          <KV label="Stamp Duty" value={fmt(out.Stamp_Duty ?? charges.stamp_duty)} />
          <KV label="CERSAI Charge" value={fmt(out.Cersai_Charge ?? charges.cersai_charge)} />
          <KV label="Life Insurance" value={fmt(out.Life_Insurance ?? charges.life_insurance)} />
          <KV label="Documentation Charge" value={fmt(charges.documentation_charge)} />
          <KV label="Valuation Fee" value={fmt(charges.valuation_fee)} />
          <KV label="Legal Fee" value={fmt(charges.legal_fee)} />
          <KV label="Other Charges" value={fmt(charges.other_charges)} />
        </div>
        {charges._raw_grid?.headers?.length > 0 && (
          <div className="mt-4">
            <RawGridTable grid={charges._raw_grid} onCellSave={onCellSave} />
          </div>
        )}
      </Section>

      <SheetSection title="CGTMSE" sheetData={cgtmse} onCellSave={onCellSave}>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <KV label="CGTMSE Applicable" value={cgtmse.applicable ?? out.CGTMSE_applicable} />
          <KV label="CGTMSE Charge" value={fmt(out.CGTMSE_Charge ?? cgtmse.charge)} />
          <KV label="Cover Amount" value={fmt(cgtmse.cover_amount)} />
          <KV label="Guarantee Fee" value={fmt(cgtmse.guarantee_fee)} />
          {Object.entries(cgtmse).filter(([k]) => !k.startsWith("_") && !["applicable", "charge", "cover_amount", "guarantee_fee"].includes(k)).map(([k, v]) => (
            <KV key={k} label={k.replace(/_/g, " ")} value={v as any} />
          ))}
        </div>
      </SheetSection>
    </>
  );
}

/* ─── 22. Disbursement ─── */
function DisbursementTab({ d, onFieldSave, onCellSave }: { d: any; onFieldSave: any; onCellSave: any }) {
  const disb = d.disbursement ?? {};
  const hasRawGrid = disb._raw_grid?.headers?.length > 0;
  const fields = Object.entries(disb).filter(([k]) => !k.startsWith("_"));

  return (
    <SheetSection title="Disbursement Details" sheetData={disb} onCellSave={onCellSave}>
      {fields.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {fields.map(([k, v]) => (
            <EditableField key={k} label={k.replace(/_/g, " ")} value={v} fieldKey={`disbursement.${k}`} onSave={onFieldSave} />
          ))}
        </div>
      ) : (
        <p className="text-sm text-gray-400 italic">No disbursement data available.</p>
      )}
    </SheetSection>
  );
}
