import { useState, useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import {
  ArrowLeft, Shield, Landmark, TrendingUp, FileText,
  ClipboardCheck, Scale, Gavel, Calculator, AlertTriangle, CheckCircle2,
  XCircle, User, Package, FileBarChart,
  IndianRupee, Percent, Clock,
} from "lucide-react";
import api, { formatCrore } from "../utils/api";
import EditableField from "../components/cam/EditableField";
import MetricCard from "../components/cam/MetricCard";
import DataTable, { Column } from "../components/cam/DataTable";

const TABS = [
  { id: "overview", label: "Overview", icon: TrendingUp },
  { id: "application", label: "Application", icon: User },
  { id: "bureau", label: "Bureau & Credit", icon: Shield },
  { id: "banking", label: "Banking", icon: Landmark },
  { id: "income", label: "Income (AIP)", icon: Calculator },
  { id: "gst", label: "GST & Financials", icon: FileBarChart },
  { id: "security", label: "Security & Stock", icon: Package },
  { id: "scorecard", label: "Scorecard", icon: ClipboardCheck },
  { id: "decision", label: "Loan Decision", icon: Gavel },
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

const Section = ({ title, children, className = "" }: { title: string; children: React.ReactNode; className?: string }) => (
  <div className={`bg-white border border-gray-100 rounded-xl p-5 shadow-sm ${className}`}>
    <h3 className="font-bold text-gray-900 text-sm border-b border-gray-100 pb-2.5 mb-4">{title}</h3>
    {children}
  </div>
);
const KV = ({ label, value, mono }: { label: string; value: any; mono?: boolean }) => (
  <div className="flex justify-between items-center py-1.5 border-b border-gray-50 last:border-0">
    <span className="text-xs text-gray-500">{label}</span>
    <span className={`text-xs font-semibold text-gray-900 ${mono ? "font-mono" : ""}`}>{String(value ?? "—")}</span>
  </div>
);

/* ── Helper: get output value by key ── */
function o(d: any, key: string, fallback: any = null) {
  return d?.output?.[key] ?? fallback;
}

/* ─── Component ─── */
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
  const handleFieldSave = async (key: string, value: any) => { await patchMutation.mutateAsync({ [key]: value }); };
  const handleCellSave = async (rowIdx: number, key: string, value: any) => { await patchMutation.mutateAsync({ [`${key}_${rowIdx}`]: value }); };

  if (isLoading) return <div className="flex items-center justify-center h-96"><div className="animate-pulse text-gray-400">Loading CAM data...</div></div>;
  if (error || !cam) return <div className="flex flex-col items-center justify-center h-96 gap-3"><AlertTriangle className="text-red-400" size={32} /><p className="text-gray-600 text-sm">Failed to load CAM data</p><Link to={`/cases/${id}`} className="text-blue-600 text-sm hover:underline">Back to case</Link></div>;

  const d = cam as any;
  const app = d.application ?? {};
  const out = d.output ?? {};
  const bureau = d.bureau ?? {};
  const sc = d.scorecard ?? {};
  const lf = d.loan_final ?? {};
  const ir = d.interest_rate ?? {};
  const pd = d.pd_notes ?? {};

  // Find primary bureau score
  const primaryBureau = bureau.scores?.find((s: any) => s.score != null);
  const bureauScore = primaryBureau?.score;

  const renderTab = () => {
    switch (activeTab) {
      case "overview": return <OverviewTab d={d} out={out} lf={lf} bureauScore={bureauScore} />;
      case "application": return <ApplicationTab app={app} out={out} />;
      case "bureau": return <BureauTab bureau={bureau} out={out} onCellSave={handleCellSave} />;
      case "banking": return <BankingTab out={out} />;
      case "income": return <IncomeTab d={d} out={out} onFieldSave={handleFieldSave} onCellSave={handleCellSave} />;
      case "gst": return <GSTTab d={d} out={out} />;
      case "security": return <SecurityTab d={d} onCellSave={handleCellSave} />;
      case "scorecard": return <ScorecardTab sc={sc} devs={d.deviations ?? []} onFieldSave={handleFieldSave} onCellSave={handleCellSave} />;
      case "decision": return <DecisionTab d={d} out={out} lf={lf} ir={ir} pd={pd} onFieldSave={handleFieldSave} />;
      default: return null;
    }
  };

  return (
    <div className="max-w-[1440px] mx-auto px-6 py-5">
      <Link to={`/cases/${id}`} className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 mb-4 transition"><ArrowLeft size={14} /> Back to case</Link>

      {/* Hero */}
      <div className="bg-gradient-to-r from-slate-900 to-slate-700 text-white rounded-xl p-6 mb-5">
        <div className="flex justify-between items-start">
          <div>
            <p className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-1">Credit Appraisal Memorandum</p>
            <h1 className="text-2xl font-bold">{app.applicant_name ?? app.business_name ?? "—"}</h1>
            <p className="text-slate-300 text-sm mt-1">
              {fmt(out.requested_loan_amount)} · {out.requested_loan_type ?? app.loan_type ?? "—"} · {app.business_name ?? ""}
            </p>
          </div>
          <div className="text-right space-y-1">
            {sc.risk_band && <span className={`inline-block px-3 py-1 rounded-full text-xs font-bold border ${riskBandColor(sc.risk_band)}`}>{sc.risk_band}</span>}
            {out.score_risk_band && !sc.risk_band && <span className={`inline-block px-3 py-1 rounded-full text-xs font-bold border ${riskBandColor(out.score_risk_band)}`}>{out.score_risk_band}</span>}
            {bureauScore && <p className="text-slate-300 text-xs mt-1">Bureau: {bureauScore}</p>}
            {(sc.total_score ?? out.total_score_obtained) && <p className="text-slate-400 text-xs">Score: {sc.total_score ?? out.total_score_obtained}</p>}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="sticky top-0 z-20 bg-gray-50 border-b border-gray-200 -mx-6 px-6 mb-5">
        <div className="flex gap-0.5 overflow-x-auto py-1">
          {TABS.map((t) => {
            const Icon = t.icon;
            const active = activeTab === t.id;
            return (
              <button key={t.id} onClick={() => setActiveTab(t.id)} className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition ${active ? "bg-white text-blue-700 shadow-sm border border-gray-200" : "text-gray-500 hover:text-gray-700 hover:bg-white/50"}`}>
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

function OverviewTab({ d, out, lf, bureauScore }: { d: any; out: any; lf: any; bureauScore: any }) {
  const eligData = [
    { name: "Bank Acc", value: out.Eligibility_as_per_Bank_Account ?? 0 },
    { name: "GST", value: out.Eligibility_as_per_GST_Return ?? 0 },
    { name: "ITR", value: out.Eligibility_as_per_ITR ?? 0 },
    { name: "Income", value: out.Eligibility_as_per_Income_Assessment ?? 0 },
    { name: "Security", value: out.Eligibility_as_per_Security ?? 0 },
  ];

  const sanctionedAmount = out.Final_Sanctioned_Amount;
  const finalRate = out.Final_Interest_Rate;
  const finalEMI = out.Final_Proposed_Loan ?? lf.emi;
  const finalTenure = out.Final_Tenure ?? lf.tenure;
  const foir = out.Final_FOIR;

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <MetricCard label="Bureau Score" value={bureauScore ?? "—"} color={bureauScore >= 700 ? "green" : bureauScore >= 600 ? "blue" : "red"} icon={Shield} />
        <MetricCard label="FOIR" value={pct(foir)} color="blue" icon={Percent} />
        <MetricCard label="Loan Amount" value={fmt(sanctionedAmount)} color={sanctionedAmount === "Reject" ? "red" : "green"} icon={IndianRupee} />
        <MetricCard label="Interest Rate" value={finalRate != null ? `${(finalRate * 100).toFixed(1)}%` : "—"} color="yellow" icon={TrendingUp} />
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
          <div><p className="text-xs text-gray-500">Rate</p><p className="text-lg font-bold">{finalRate != null ? `${(finalRate * 100).toFixed(2)}%` : "—"}</p></div>
          <div><p className="text-xs text-gray-500">EMI</p><p className="text-lg font-bold">{fmt(finalEMI)}</p></div>
          <div><p className="text-xs text-gray-500">Program</p><p className="text-lg font-bold text-blue-700">{out.Income_Program_for_Eligbility ?? "—"}</p></div>
        </div>
      </Section>

      {/* Quick stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Section title="Banking"><KV label="Avg Bank Balance" value={fmt(out.combined_average_bank_balance)} /><KV label="Bank Turnover" value={fmt(out.combined_bto)} /><KV label="Bank Accounts" value={out.number_of_bank_accounts} /></Section>
        <Section title="Obligations"><KV label="Total EMI (All)" value={fmt(out.Total_existing_EMI_of_All_loans)} /><KV label="Obligated EMI" value={fmt(out.total_obligated_EMI)} /><KV label="ABB/EMI Ratio" value={out["Final_ABB/EMI_ratio"] ?? "—"} /></Section>
        <Section title="GST"><KV label="Annual GST Turnover" value={out.Annual_gst_turnover} /><KV label="Filing Frequency" value={out.gst_filing_frequency} /><KV label="GST Status" value={out.GST_status} /></Section>
        <Section title="Business"><KV label="Nature" value={out.Nature_of_business} /><KV label="Constitution" value={out.business_constitution} /><KV label="Business Type" value={out.business_type} /></Section>
      </div>
    </>
  );
}

function ApplicationTab({ app, out }: { app: any; out: any }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      <Section title="Business Information">
        <KV label="Business Name" value={app.business_name} />
        <KV label="Constitution" value={app.constitution ?? out.business_constitution} />
        <KV label="Nature of Business" value={app.nature_of_business ?? out.Nature_of_business} />
        <KV label="Business Type" value={app.business_type ?? out.business_type} />
        <KV label="Enterprise Type" value={app.enterprise_type} />
        <KV label="PAN" value={app.pan} mono />
        <KV label="PAN Status" value={app.pan_status} />
        <KV label="GSTIN" value={app.gstin} mono />
        <KV label="Udyam Number" value={app.udyam_number} mono />
        <KV label="Business Address" value={typeof app.business_address === "object" ? JSON.stringify(app.business_address) : app.business_address} />
        <KV label="Annual Turnover" value={fmt(app.annual_turnover)} />
        <KV label="Monthly Sales" value={fmt(app.monthly_sales)} />
        <KV label="Current Stock Value" value={fmt(app.current_stock_value)} />
      </Section>
      <Section title="Applicant Information">
        <KV label="Name" value={app.applicant_name} />
        <KV label="Age" value={app.age} />
        <KV label="Date of Birth" value={app.dob} />
        <KV label="Mobile" value={app.mobile} mono />
        <KV label="Email" value={app.email} />
        <KV label="Occupation" value={app.occupation} />
        <KV label="Current Address" value={app.current_address} />
      </Section>
      <Section title="Loan Details">
        <KV label="Requested Amount" value={fmt(out.requested_loan_amount)} />
        <KV label="Loan Type" value={out.requested_loan_type ?? app.loan_type} />
        <KV label="Co-applicant" value={out["co-applicant_relationship"]} />
        <KV label="Primary Security" value={app.primary_security ?? out.Stock_security_amount_total} />
        <KV label="Secondary Security" value={app.secondary_security} />
      </Section>
      <Section title="Sourcing">
        <KV label="Branch" value={app.branch ?? out.sourcing_branch} />
        <KV label="Application ID" value={app.app_id} mono />
        <KV label="Applied Date" value={app.applied_date} />
        <KV label="CAM ID" value={app.cam_id} mono />
      </Section>
    </div>
  );
}

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
    { key: "emi_assessed", header: "EMI Assessed", align: "right", format: fmt },
    { key: "obligated", header: "Obligated", render: (r) => r.obligated === true || r.obligated === "True" ? <CheckCircle2 size={14} className="text-green-600" /> : <XCircle size={14} className="text-gray-300" /> },
  ];

  return (
    <>
      <Section title="Bureau Scores">
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
      </Section>
      <div className="grid grid-cols-3 gap-3">
        <MetricCard label="Total EMI (All)" value={fmt(out.Total_existing_EMI_of_All_loans)} color="red" icon={Calculator} />
        <MetricCard label="Obligated EMI" value={fmt(out.total_obligated_EMI)} color="yellow" icon={Calculator} />
        <MetricCard label="Commercial Bureau" value={out.Commercial_bureau_score ?? commercial?.score ?? "NA"} color="gray" icon={Shield} />
      </div>
      {loans.length > 0 && (
        <Section title={`Existing Loans (${loans.length})`}>
          <DataTable columns={loanCols} data={loans} compact />
        </Section>
      )}
    </>
  );
}

function BankingTab({ out }: { out: any }) {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard label="Bank Accounts" value={out.number_of_bank_accounts ?? "—"} color="blue" icon={Landmark} />
        <MetricCard label="Avg Bank Balance" value={fmt(out.combined_average_bank_balance)} color="blue" icon={IndianRupee} />
        <MetricCard label="Bank Turnover" value={fmt(out.combined_bto)} color="green" icon={TrendingUp} />
        <MetricCard label="Net Business Credits" value={out.combined_net_business_credits ?? "—"} color="gray" icon={FileText} />
      </div>
      <Section title="Eligibility from Banking">
        <KV label="Eligibility (Bank Account)" value={fmt(out.Eligibility_as_per_Bank_Account)} />
        <KV label="Max Eligibility (FOIR)" value={fmt(out.Maximum_Eligibility_as_per_FOIR)} />
        <KV label="FOIR" value={pct(out.Final_FOIR)} />
        <KV label="ABB/EMI Ratio" value={out["Final_ABB/EMI_ratio"] ?? "—"} />
      </Section>
    </div>
  );
}

function IncomeTab({ d, out, onFieldSave, onCellSave }: { d: any; out: any; onFieldSave: any; onCellSave: any }) {
  const aip = d.aip ?? {};
  const pi = aip.primary_income ?? {};
  const bills = aip.bills ?? [];
  const secondary = aip.secondary_income ?? [];

  const billCols: Column[] = [
    { key: "bill_no", header: "Bill No" },
    { key: "amount", header: "Amount", align: "right", format: fmt, editable: true, type: "number" },
  ];

  return (
    <>
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
      <Section title="Financial Inputs">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <KV label="Type (Prev Year)" value={out.type_of_financials_previous_year} />
          <KV label="Type (Curr Year)" value={out.type_of_financials_current_year} />
          <KV label="Turnover (Prev)" value={fmt(out.turnover_previous_year)} />
          <KV label="Turnover (Curr)" value={fmt(out.turnover_current_year)} />
          <KV label="Gross Profit (Prev)" value={fmt(out.gross_profit_previous_year)} />
          <KV label="Gross Profit (Curr)" value={fmt(out.gross_profit_current_year)} />
          <KV label="PAT (Prev)" value={fmt(out.profit_after_taxes_previous_year)} />
          <KV label="PAT (Curr)" value={fmt(out.profit_after_taxes_current_year)} />
          <KV label="ITR Income (Prev)" value={fmt(out.itr_income_previous_year)} />
          <KV label="ITR Income (Curr)" value={fmt(out.itr_income_current_year)} />
          <KV label="Final ITR Considered" value={fmt(out.final_itr_income_considered)} />
        </div>
      </Section>
      {bills.length > 0 && <Section title="Bills Collection"><DataTable columns={billCols} data={bills} onCellSave={onCellSave} compact /></Section>}
    </>
  );
}

function GSTTab({ d, out }: { d: any; out: any }) {
  const gst = d.gst ?? {};
  const manual = gst.manual_pull ?? {};
  // Filter out bad rows (header rows, "Amount (Rs)", "0", "00:00:00")
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
    <>
      <Section title="GST Details">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-4">
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3"><p className="text-[10px] text-yellow-600 uppercase font-semibold">GSTIN</p><p className="text-sm font-bold text-gray-900">{manual.gstin ?? d.application?.gstin ?? "—"}</p></div>
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3"><p className="text-[10px] text-yellow-600 uppercase font-semibold">Status</p><p className="text-sm font-bold text-gray-900">{manual.status ?? out.GST_status ?? "—"}</p></div>
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3"><p className="text-[10px] text-yellow-600 uppercase font-semibold">Latest Month</p><p className="text-sm font-bold text-gray-900">{manual.latest_month ?? out.latest_gst_filed_month ?? "—"}</p></div>
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3"><p className="text-[10px] text-yellow-600 uppercase font-semibold">Frequency</p><p className="text-sm font-bold text-gray-900">{manual.frequency ?? out.gst_filing_frequency ?? "—"}</p></div>
          <div className="border border-gray-200 rounded-lg p-3"><p className="text-[10px] text-gray-500 uppercase font-semibold">Annual Turnover</p><p className="text-sm font-bold text-gray-900">{out.Annual_gst_turnover ?? "—"}</p></div>
          <div className="border border-gray-200 rounded-lg p-3"><p className="text-[10px] text-gray-500 uppercase font-semibold">Eligibility (GST)</p><p className="text-sm font-bold text-gray-900">{fmt(out.Eligibility_as_per_GST_Return)}</p></div>
        </div>
        {filings.length > 0 ? (
          <DataTable columns={filingCols} data={filings} compact />
        ) : (
          <p className="text-sm text-gray-400 italic">No GST filing data available. Upload GST returns to populate.</p>
        )}
      </Section>
      <Section title="Company Financials">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <KV label="Current Assets (Prev)" value={fmt(out.current_assets_previous_year)} />
          <KV label="Current Assets (Curr)" value={fmt(out.current_assets_current_year)} />
          <KV label="Non-Current Assets (Prev)" value={fmt(out.non_current_assets_previous_year)} />
          <KV label="Non-Current Assets (Curr)" value={fmt(out.non_current_assets_current_year)} />
          <KV label="Current Liabilities (Prev)" value={fmt(out.current_liabilities_previous_year)} />
          <KV label="Current Liabilities (Curr)" value={fmt(out.current_liabilities_current_year)} />
          <KV label="Capital (Prev)" value={fmt(out.capital_previous_year)} />
          <KV label="Capital (Curr)" value={fmt(out.capital_current_year)} />
        </div>
      </Section>
    </>
  );
}

function SecurityTab({ d, onCellSave }: { d: any; onCellSave: any }) {
  // Filter out "Total" row from stock items
  const stock = (d.stock_details ?? []).filter((s: any) => s.sl_no !== "Total" && s.description !== null);
  const out = d.output ?? {};
  const totalStock = stock.reduce((s: number, r: any) => s + (r.amount ?? 0), 0);
  const stockCols: Column[] = [
    { key: "sl_no", header: "#", width: "40px" },
    { key: "description", header: "Description", editable: true },
    { key: "quantity", header: "Qty", align: "right", editable: true, type: "number" },
    { key: "rate", header: "Rate (₹)", align: "right", format: fmt, editable: true, type: "number" },
    { key: "amount", header: "Amount (₹)", align: "right", format: fmt },
  ];
  return (
    <>
      <div className="grid grid-cols-3 gap-3">
        <MetricCard label="Stock Security" value={fmt(out.Stock_security_amount_total)} color="blue" icon={Package} />
        <MetricCard label="Movable P&M" value={fmt(out["Security_Value_Movable_P&M"])} color="gray" icon={Scale} />
        <MetricCard label="Vehicle P&M" value={fmt(out["Security_Value_Vehicle_P&M"])} color="gray" icon={Scale} />
      </div>
      <Section title={`Stock Details (${stock.length} items)`}>
        <DataTable columns={stockCols} data={stock} onCellSave={onCellSave} compact
          footer={<tr className="bg-slate-50 font-bold"><td colSpan={4} className="px-3 py-2 text-xs text-right">Total Stock Value</td><td className="px-3 py-2 text-xs text-right font-mono">{fmt(totalStock)}</td></tr>} />
      </Section>
    </>
  );
}

function ScorecardTab({ sc, devs, onFieldSave, onCellSave }: { sc: any; devs: any[]; onFieldSave: any; onCellSave: any }) {
  const params = sc.parameters ?? [];
  const paramCols: Column[] = [
    { key: "sr_no", header: "#", width: "40px" },
    { key: "parameter", header: "Parameter" },
    { key: "max_score", header: "Max", align: "right" },
    { key: "criteria", header: "Criteria", editable: true },
    { key: "score", header: "Score", align: "right" },
  ];
  const devCols: Column[] = [
    { key: "deviation", header: "Deviation" },
    { key: "description", header: "Description", editable: true },
    { key: "mitigants", header: "Mitigants", editable: true },
    { key: "approving_authority", header: "Authority" },
    { key: "approval_status", header: "Status", render: (r) => <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${r.approval_status === "Approved" ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"}`}>{r.approval_status ?? "—"}</span> },
    { key: "approved_by", header: "Approved By" },
    { key: "date", header: "Date" },
  ];

  return (
    <>
      <Section title="Scorecard Summary">
        <div className="flex items-center gap-6 mb-4">
          <div className="text-center"><p className="text-3xl font-bold text-gray-900">{sc.total_score ?? "—"}</p><p className="text-xs text-gray-500">Total Score</p></div>
          {sc.risk_band && <span className={`px-4 py-2 rounded-full text-sm font-bold border ${riskBandColor(sc.risk_band)}`}>{sc.risk_band}</span>}
        </div>
        {params.length > 0 && <DataTable columns={paramCols} data={params} onCellSave={onCellSave} compact />}
      </Section>
      {devs.length > 0 && <Section title={`Deviations (${devs.length})`}><DataTable columns={devCols} data={devs} onCellSave={onCellSave} compact /></Section>}
    </>
  );
}

function DecisionTab({ d, out, lf, ir, pd, onFieldSave }: { d: any; out: any; lf: any; ir: any; pd: any; onFieldSave: any }) {
  const conditions = d.sanction_conditions ?? [];
  const purposes = d.loan_purpose ?? [];
  const refs = d.reference_checks ?? [];
  const finalRate = out.Final_Interest_Rate ?? lf.interest_rate;

  const purposeCols: Column[] = [
    { key: "sl_no", header: "#", width: "40px" },
    { key: "purpose", header: "Purpose" },
    { key: "details", header: "Details" },
    { key: "amount", header: "Amount", align: "right", format: fmt },
  ];
  const refCols: Column[] = [
    { key: "name", header: "Name" },
    { key: "relation", header: "Relation" },
    { key: "phone", header: "Phone" },
    { key: "feedback", header: "Feedback" },
  ];

  return (
    <>
      <Section title="Interest Rate">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {Object.entries(ir).filter(([k]) => !k.startsWith("_")).map(([k, v]) => (
            <EditableField key={k} label={k.replace(/_/g, " ")} value={v} fieldKey={`interest_rate.${k}`} onSave={onFieldSave} />
          ))}
          <div className="col-span-2 bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-center justify-between">
            <span className="text-sm font-medium text-blue-800">Final Rate</span>
            <span className="text-xl font-bold text-blue-900">{finalRate != null ? `${(Number(finalRate) * 100).toFixed(2)}%` : "—"}</span>
          </div>
        </div>
      </Section>

      <Section title="Eligibility Summary">
        <div className="grid grid-cols-3 md:grid-cols-5 gap-3">
          {[
            { label: "Bank Account", v: out.Eligibility_as_per_Bank_Account },
            { label: "GST Return", v: out.Eligibility_as_per_GST_Return },
            { label: "ITR", v: out.Eligibility_as_per_ITR },
            { label: "Company Financials", v: out.Eligibility_as_per_Company_Financials },
            { label: "Income Assessment", v: out.Eligibility_as_per_Income_Assessment },
            { label: "Max FOIR Elig.", v: out.Maximum_Eligibility_as_per_FOIR },
            { label: "Security", v: out.Eligibility_as_per_Security },
            { label: "Recommended", v: out.Recommended_Loan_Amount_as_per_Underwriter },
            { label: "Sanctioned", v: out.Final_Sanctioned_Amount },
          ].map((e) => (
            <div key={e.label} className="border rounded-lg p-2.5"><p className="text-[10px] text-gray-500 uppercase">{e.label}</p><p className="text-sm font-bold text-gray-900">{fmt(e.v)}</p></div>
          ))}
        </div>
      </Section>

      <Section title="Final Loan Decision">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <MetricCard label="Amount" value={fmt(out.Final_Sanctioned_Amount)} color={out.Final_Sanctioned_Amount === "Reject" ? "red" : "green"} icon={IndianRupee} />
          <MetricCard label="Tenure" value={lf.tenure ? `${lf.tenure} months` : "—"} color="blue" icon={Clock} />
          <MetricCard label="Rate" value={finalRate ? `${(Number(finalRate) * 100).toFixed(2)}%` : "—"} color="yellow" icon={Percent} />
          <MetricCard label="EMI" value={fmt(out.Final_Proposed_Loan ?? lf.emi)} color="gray" icon={Calculator} />
        </div>
      </Section>

      {purposes.length > 0 && <Section title="Loan Purpose"><DataTable columns={purposeCols} data={purposes} compact /></Section>}

      <Section title={`Sanction Conditions (${conditions.length})`}>
        <div className="space-y-2">
          {conditions.length > 0 ? conditions.map((c: any, i: number) => (
            <EditableField key={i} value={typeof c === "object" ? c.condition || c.value || JSON.stringify(c) : c} fieldKey={`sanction_conditions.${i}`} onSave={onFieldSave} className="w-full" />
          )) : <p className="text-sm text-gray-400">No sanction conditions</p>}
        </div>
      </Section>

      <Section title="PD Notes">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {Object.entries(pd).filter(([k, v]) => v && !k.startsWith("_") && !k.startsWith("Notes")).map(([k, v]) => (
            <EditableField key={k} label={k} value={v} fieldKey={`pd_notes.${k}`} onSave={onFieldSave} />
          ))}
        </div>
        <div className="grid grid-cols-1 gap-3 mt-3">
          {Object.entries(pd).filter(([k]) => k.startsWith("Notes")).map(([k, v]) => (
            <EditableField key={k} label={k} value={v} fieldKey={`pd_notes.${k}`} type="textarea" onSave={onFieldSave} />
          ))}
        </div>
      </Section>

      {refs.length > 0 && <Section title="Reference Checks"><DataTable columns={refCols} data={refs} compact /></Section>}

      {/* Charges */}
      <Section title="Charges & Fees">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <KV label="Processing Fee" value={out.Processing_Fee} />
          <KV label="Stamp Duty" value={fmt(out.Stamp_Duty)} />
          <KV label="CGTMSE Charge" value={fmt(out.CGTMSE_Charge)} />
          <KV label="CERSAI Charge" value={fmt(out.Cersai_Charge)} />
          <KV label="Life Insurance" value={fmt(out.Life_Insurance)} />
        </div>
      </Section>
    </>
  );
}
