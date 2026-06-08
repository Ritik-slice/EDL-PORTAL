import { useState, useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import {
  ArrowLeft, Shield, CreditCard, Landmark, TrendingUp, FileText,
  ClipboardCheck, Scale, Gavel, Calculator, AlertTriangle, CheckCircle2,
  XCircle, Building2, User, Phone, Mail, MapPin, Briefcase, Calendar,
  IndianRupee, Percent, Clock, Package, FileBarChart, Users,
} from "lucide-react";
import api, { formatCrore } from "../utils/api";
import EditableField from "../components/cam/EditableField";
import MetricCard from "../components/cam/MetricCard";
import DataTable, { Column } from "../components/cam/DataTable";

/* ─── Tabs ──────────────────────────────── */
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

/* ─── Helpers ──────────────────────────── */
const fmt = (v: number | undefined) => v != null ? formatCrore(v) : "—";
const pct = (v: number | undefined) => v != null ? `${v.toFixed(1)}%` : "—";

const riskBandColor = (band: string) => {
  const b = band?.toUpperCase();
  if (b === "A" || b === "LOW") return "bg-green-100 text-green-800 border-green-300";
  if (b === "B" || b === "MODERATE") return "bg-blue-100 text-blue-800 border-blue-300";
  if (b === "C" || b === "HIGH") return "bg-yellow-100 text-yellow-800 border-yellow-300";
  return "bg-red-100 text-red-800 border-red-300";
};

const scoreColor = (score: number) => {
  if (score >= 750) return "text-green-700 bg-green-50";
  if (score >= 650) return "text-blue-700 bg-blue-50";
  if (score >= 550) return "text-yellow-700 bg-yellow-50";
  return "text-red-700 bg-red-50";
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

/* ─── Component ────────────────────────── */
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
    mutationFn: (payload: Record<string, any>) =>
      api.patch(`/cases/${id}/cam-data`, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["cam-data", id] }),
  });

  const handleFieldSave = async (key: string, value: any) => {
    await patchMutation.mutateAsync({ [key]: value });
  };

  const handleCellSave = async (rowIdx: number, key: string, value: any) => {
    await patchMutation.mutateAsync({ [`${key}_${rowIdx}`]: value });
  };

  /* ─── Loading / Error ─── */
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-pulse text-gray-400">Loading CAM data...</div>
      </div>
    );
  }

  if (error || !cam) {
    return (
      <div className="flex flex-col items-center justify-center h-96 gap-3">
        <AlertTriangle className="text-red-400" size={32} />
        <p className="text-gray-600 text-sm">Failed to load CAM data</p>
        <Link to={`/cases/${id}`} className="text-blue-600 text-sm hover:underline">Back to case</Link>
      </div>
    );
  }

  const d = cam as any; // typed loosely for flexibility with backend shape

  /* ─── Editable field set ─── */
  const editableKeys = new Set((d.editable_fields ?? []).map((f: any) => f.key));
  const isEditable = (key: string) => editableKeys.has(key);

  /* ─── Tab content ─── */
  const renderTab = () => {
    switch (activeTab) {
      case "overview":
        return <OverviewTab d={d} />;
      case "application":
        return <ApplicationTab d={d} />;
      case "bureau":
        return <BureauTab d={d} onCellSave={handleCellSave} />;
      case "banking":
        return <BankingTab d={d} />;
      case "income":
        return <IncomeTab d={d} onFieldSave={handleFieldSave} onCellSave={handleCellSave} />;
      case "gst":
        return <GSTTab d={d} />;
      case "security":
        return <SecurityTab d={d} onCellSave={handleCellSave} />;
      case "scorecard":
        return <ScorecardTab d={d} onFieldSave={handleFieldSave} onCellSave={handleCellSave} />;
      case "decision":
        return <DecisionTab d={d} onFieldSave={handleFieldSave} />;
      default:
        return null;
    }
  };

  return (
    <div className="max-w-[1440px] mx-auto px-6 py-5">
      {/* Back nav */}
      <Link to={`/cases/${id}`} className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 mb-4 transition">
        <ArrowLeft size={14} /> Back to case
      </Link>

      {/* Hero */}
      <div className="bg-gradient-to-r from-slate-900 to-slate-700 text-white rounded-xl p-6 mb-5">
        <div className="flex justify-between items-start">
          <div>
            <p className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-1">Credit Appraisal Memorandum</p>
            <h1 className="text-2xl font-bold">{d.application?.applicant_name ?? d.application?.business_name ?? "—"}</h1>
            <p className="text-slate-300 text-sm mt-1">
              {fmt(d.application?.loan_amount)} · {d.application?.loan_type ?? "—"} · CAM {d.application?.cam_id ?? ""}
            </p>
          </div>
          <div className="text-right space-y-1">
            {d.scorecard?.risk_band && (
              <span className={`inline-block px-3 py-1 rounded-full text-xs font-bold border ${riskBandColor(d.scorecard.risk_band)}`}>
                {d.scorecard.risk_band}
              </span>
            )}
            {d.scorecard?.total_score != null && (
              <p className="text-slate-400 text-xs">Score: {d.scorecard.total_score}</p>
            )}
          </div>
        </div>
      </div>

      {/* Sticky Tabs */}
      <div className="sticky top-0 z-20 bg-gray-50 border-b border-gray-200 -mx-6 px-6 mb-5">
        <div className="flex gap-0.5 overflow-x-auto py-1">
          {TABS.map((t) => {
            const Icon = t.icon;
            const active = activeTab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                className={`flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium rounded-t-lg whitespace-nowrap transition ${
                  active
                    ? "bg-white text-blue-700 border border-b-0 border-gray-200 shadow-sm -mb-px"
                    : "text-gray-500 hover:text-gray-800 hover:bg-gray-100"
                }`}
              >
                <Icon size={13} />
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab Content */}
      <div className="space-y-5">{renderTab()}</div>
    </div>
  );
}

/* ═══════════════════════════════════════════
   TAB COMPONENTS
   ═══════════════════════════════════════════ */

function OverviewTab({ d }: { d: any }) {
  const app = d.application ?? {};
  const sc = d.scorecard ?? {};
  const elig = d.eligibility ?? {};
  const loan = d.loan_final ?? {};
  const ir = d.interest_rate ?? {};
  const bureau = d.bureau?.scores?.[0];

  const eligData = [
    { name: "Bank Acc", value: elig.bank_account ?? 0 },
    { name: "GST", value: elig.gst_return ?? 0 },
    { name: "ITR", value: elig.itr ?? 0 },
    { name: "Income", value: elig.income_assessment ?? 0 },
    { name: "Security", value: elig.security ?? 0 },
  ];

  return (
    <>
      {/* Key Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <MetricCard label="Bureau Score" value={bureau?.score ?? "—"} color={bureau?.score >= 700 ? "green" : bureau?.score >= 600 ? "blue" : "red"} icon={Shield} />
        <MetricCard label="FOIR" value={pct(elig.max_foir)} color="blue" icon={Percent} />
        <MetricCard label="Loan Amount" value={fmt(loan.amount)} color="green" icon={IndianRupee} />
        <MetricCard label="Interest Rate" value={ir.final_rate != null ? `${ir.final_rate}%` : "—"} color="yellow" icon={TrendingUp} />
        <MetricCard label="EMI" value={fmt(loan.emi)} color="gray" icon={Calculator} />
        <MetricCard label="Tenure" value={loan.tenure ? `${loan.tenure} mo` : "—"} color="gray" icon={Clock} />
      </div>

      {/* Eligibility Chart */}
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

      {/* Loan Structure */}
      <Section title="Loan Structure Summary">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div><p className="text-xs text-gray-500">Recommended</p><p className="text-lg font-bold text-gray-900">{fmt(elig.recommended)}</p></div>
          <div><p className="text-xs text-gray-500">Sanctioned</p><p className="text-lg font-bold text-green-700">{fmt(elig.sanctioned)}</p></div>
          <div><p className="text-xs text-gray-500">Rate</p><p className="text-lg font-bold">{ir.final_rate != null ? `${ir.final_rate}%` : "—"}</p></div>
          <div><p className="text-xs text-gray-500">EMI</p><p className="text-lg font-bold">{fmt(loan.emi)}</p></div>
        </div>
      </Section>
    </>
  );
}

function ApplicationTab({ d }: { d: any }) {
  const app = d.application ?? {};
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      <Section title="Business Information">
        <div className="space-y-0">
          <KV label="Business Name" value={app.business_name} />
          <KV label="Constitution" value={app.constitution} />
          <KV label="Nature of Business" value={app.nature_of_business} />
          <KV label="Business Type" value={app.business_type} />
          <KV label="Enterprise Type" value={app.enterprise_type} />
          <KV label="PAN" value={app.pan} mono />
          <KV label="PAN Status" value={app.pan_status} />
          <KV label="GSTIN" value={app.gstin} mono />
          <KV label="Udyam Number" value={app.udyam_number} mono />
          <KV label="Date of Commencement" value={app.date_of_commencement} />
          <KV label="Business Vintage" value={app.business_vintage} />
          <KV label="Business Address" value={app.business_address} />
          <KV label="Annual Turnover" value={fmt(app.annual_turnover)} />
          <KV label="Monthly Sales" value={fmt(app.monthly_sales)} />
          <KV label="Current Stock Value" value={fmt(app.current_stock_value)} />
        </div>
      </Section>

      <Section title="Applicant Information">
        <div className="space-y-0">
          <KV label="Name" value={app.applicant_name} />
          <KV label="Age" value={app.age != null ? `${app.age} years` : "—"} />
          <KV label="Date of Birth" value={app.dob} />
          <KV label="Mobile" value={app.mobile} mono />
          <KV label="Email" value={app.email} />
          <KV label="Occupation" value={app.occupation} />
          <KV label="Current Address" value={app.current_address} />
        </div>
      </Section>

      <Section title="Security Details">
        <KV label="Primary Security" value={app.primary_security} />
        <KV label="Secondary Security" value={app.secondary_security} />
      </Section>

      <Section title="Sourcing Details">
        <KV label="Branch" value={app.branch} />
        <KV label="Application ID" value={app.app_id} mono />
        <KV label="Applied Date" value={app.applied_date} />
        <KV label="Loan Type" value={app.loan_type} />
        <KV label="Loan Amount" value={fmt(app.loan_amount)} />
      </Section>
    </div>
  );
}

function BureauTab({ d, onCellSave }: { d: any; onCellSave: (r: number, k: string, v: any) => Promise<void> }) {
  const scores = d.bureau?.scores ?? [];
  const loans = d.bureau?.existing_loans ?? [];
  const commercial = d.bureau?.commercial_bureau;
  const totalEmi = loans.reduce((s: number, l: any) => s + (l.emi_assessed ?? 0), 0);

  const loanCols: Column[] = [
    { key: "borrower", header: "Borrower" },
    { key: "financier", header: "Financier" },
    { key: "loan_type", header: "Type" },
    { key: "amount", header: "Amount", align: "right", format: fmt },
    { key: "pos", header: "POS", align: "right", format: fmt },
    { key: "emi_assessed", header: "EMI", align: "right", format: fmt },
    { key: "obligated", header: "Obligated", render: (r) => r.obligated ? <CheckCircle2 size={14} className="text-green-600" /> : <XCircle size={14} className="text-gray-300" /> },
    { key: "balance_transfer", header: "BT", render: (r) => r.balance_transfer ? <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">BT</span> : "—" },
  ];

  return (
    <>
      {/* Scores */}
      <Section title="Bureau Scores">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {scores.map((s: any, i: number) => (
            <div key={i} className="border rounded-lg p-4 flex justify-between items-center">
              <div>
                <p className="text-xs text-gray-500">{s.applicant_type} – {s.name}</p>
                <p className="text-xs text-gray-400 mt-0.5">{s.provider} · {s.fetch_date}</p>
              </div>
              <span className={`text-lg font-bold px-3 py-1 rounded-lg ${scoreColor(s.score)}`}>
                {s.ntc_flag ? "NTC" : s.score}
              </span>
            </div>
          ))}
        </div>
      </Section>

      {/* Existing Loans */}
      <Section title="Existing Loans">
        <DataTable columns={loanCols} data={loans} compact />
        <div className="mt-3 flex justify-end">
          <div className="bg-slate-50 border border-slate-200 rounded-lg px-4 py-2">
            <span className="text-xs text-gray-500 mr-3">Total EMI</span>
            <span className="text-sm font-bold text-gray-900">{fmt(totalEmi)}</span>
          </div>
        </div>
      </Section>

      {/* Commercial */}
      {commercial && (
        <Section title="Commercial Bureau">
          <div className="grid grid-cols-3 gap-4">
            <KV label="Provider" value={commercial.provider} />
            <KV label="Score" value={commercial.score} />
            <KV label="Date" value={commercial.date} />
          </div>
        </Section>
      )}
    </>
  );
}

function BankingTab({ d }: { d: any }) {
  const elig = d.eligibility ?? {};
  return (
    <Section title="Banking Analysis">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard label="Bank Account Eligibility" value={fmt(elig.bank_account)} color="blue" icon={Landmark} />
        <MetricCard label="Max FOIR" value={pct(elig.max_foir)} color="gray" icon={Percent} />
      </div>
      <p className="text-sm text-gray-500 mt-4">Detailed bank statement analysis will appear here once banking data is parsed.</p>
    </Section>
  );
}

function IncomeTab({ d, onFieldSave, onCellSave }: { d: any; onFieldSave: (k: string, v: any) => Promise<void>; onCellSave: (r: number, k: string, v: any) => Promise<void> }) {
  const pi = d.aip?.primary_income ?? {};
  const bills = d.aip?.bills ?? [];
  const secondary = d.aip?.secondary_income ?? [];

  const billCols: Column[] = [
    { key: "bill_no", header: "Bill No" },
    { key: "amount", header: "Amount", align: "right", format: fmt, editable: true, type: "number" },
  ];

  const secCols: Column[] = [
    { key: "source", header: "Source", editable: true },
    { key: "margin", header: "Margin %", align: "right", editable: true, type: "number" },
    { key: "monthly", header: "Monthly", align: "right", format: fmt, editable: true, type: "number" },
    { key: "months", header: "Months", align: "right", editable: true, type: "number" },
    { key: "annual", header: "Annual", align: "right", format: fmt },
  ];

  return (
    <>
      <Section title="Primary Income Assessment">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <MetricCard label="Bill Days" value={pi.bill_days ?? "—"} color="gray" />
          <MetricCard label="Daily Sales" value={fmt(pi.daily_sales)} color="gray" />
          <MetricCard label="Monthly Sales" value={fmt(pi.monthly_sales)} color="blue" />
          <MetricCard label="Annual Sales" value={fmt(pi.annual_sales)} color="blue" />
          <MetricCard label="Margin" value={pct(pi.margin)} color="yellow" />
          <MetricCard label="Net Income" value={fmt(pi.net_income)} color="green" />
        </div>
      </Section>

      <Section title="Bills Collection (Kaccha-Pakka)">
        <DataTable columns={billCols} data={bills} onCellSave={onCellSave} compact />
      </Section>

      <Section title="Secondary Income">
        <DataTable columns={secCols} data={secondary} onCellSave={onCellSave} compact />
      </Section>
    </>
  );
}

function GSTTab({ d }: { d: any }) {
  const gst = d.gst ?? {};
  const manual = gst.manual_pull ?? {};
  const filings = gst.monthly_filings ?? [];
  const fin = d.financials ?? {};
  const bs = fin.balance_sheet ?? {};
  const pnl = fin.pnl ?? {};

  const filingCols: Column[] = [
    { key: "month", header: "Month" },
    { key: "fy", header: "FY" },
    { key: "amount", header: "Amount", align: "right", format: fmt },
  ];

  const bsRows = useMemo(() => {
    const sections: { label: string; data: Record<string, { prev: number; curr: number }> }[] = [
      { label: "Equity & Liabilities", data: bs.equity_liabilities ?? {} },
      { label: "Assets", data: bs.assets ?? {} },
    ];
    return sections.flatMap((s) =>
      [{ item: s.label, prev: null, curr: null, isHeader: true },
        ...Object.entries(s.data).map(([k, v]: [string, any]) => ({
          item: k.replace(/_/g, " "),
          prev: v.prev,
          curr: v.curr,
          growth: v.prev ? (((v.curr - v.prev) / v.prev) * 100) : null,
          isHeader: false,
        }))
      ]
    );
  }, [bs]);

  return (
    <>
      <Section title="GST Filing Details">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
          <KV label="GSTIN" value={manual.gstin} />
          <KV label="Status" value={manual.status} />
          <KV label="Latest Month" value={manual.latest_month} />
          <KV label="Frequency" value={manual.frequency} />
        </div>
        <DataTable columns={filingCols} data={filings} compact />
      </Section>

      <Section title="Balance Sheet (Prev vs Current)">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-50 border-b">
                <th className="text-left px-3 py-2 font-semibold text-gray-500 uppercase">Item</th>
                <th className="text-right px-3 py-2 font-semibold text-gray-500 uppercase">Previous</th>
                <th className="text-right px-3 py-2 font-semibold text-gray-500 uppercase">Current</th>
                <th className="text-right px-3 py-2 font-semibold text-gray-500 uppercase">Growth %</th>
              </tr>
            </thead>
            <tbody>
              {bsRows.map((r: any, i: number) =>
                r.isHeader ? (
                  <tr key={i} className="bg-slate-100"><td colSpan={4} className="px-3 py-2 font-bold text-gray-700 uppercase text-xs">{r.item}</td></tr>
                ) : (
                  <tr key={i} className="border-b border-gray-50 hover:bg-gray-50/50">
                    <td className="px-3 py-1.5 text-gray-700 capitalize">{r.item}</td>
                    <td className="px-3 py-1.5 text-right font-mono">{fmt(r.prev)}</td>
                    <td className="px-3 py-1.5 text-right font-mono">{fmt(r.curr)}</td>
                    <td className={`px-3 py-1.5 text-right font-mono ${r.growth > 0 ? "text-green-600" : r.growth < 0 ? "text-red-600" : ""}`}>
                      {r.growth != null ? `${r.growth.toFixed(1)}%` : "—"}
                    </td>
                  </tr>
                )
              )}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Profit & Loss Summary">
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: "Turnover", data: pnl.turnover },
            { label: "Gross Profit", data: pnl.gross_profit },
            { label: "PAT", data: pnl.pat },
          ].map((item) => (
            <div key={item.label} className="border rounded-lg p-3">
              <p className="text-xs text-gray-500 mb-2">{item.label}</p>
              <div className="flex justify-between">
                <div><p className="text-[10px] text-gray-400">Prev</p><p className="text-sm font-bold">{fmt(item.data?.prev)}</p></div>
                <div className="text-right"><p className="text-[10px] text-gray-400">Curr</p><p className="text-sm font-bold">{fmt(item.data?.curr)}</p></div>
              </div>
            </div>
          ))}
        </div>
      </Section>
    </>
  );
}

function SecurityTab({ d, onCellSave }: { d: any; onCellSave: (r: number, k: string, v: any) => Promise<void> }) {
  const stock = d.stock_details ?? [];
  const totalStock = stock.reduce((s: number, r: any) => s + (r.amount ?? 0), 0);

  const stockCols: Column[] = [
    { key: "sl_no", header: "#", width: "40px" },
    { key: "description", header: "Description", editable: true },
    { key: "quantity", header: "Qty", align: "right", editable: true, type: "number" },
    { key: "rate", header: "Rate", align: "right", format: fmt, editable: true, type: "number" },
    { key: "amount", header: "Amount", align: "right", format: fmt },
  ];

  return (
    <>
      <Section title="Stock Details">
        <DataTable columns={stockCols} data={stock} onCellSave={onCellSave} compact
          footer={
            <tr className="bg-slate-50 font-bold">
              <td colSpan={4} className="px-3 py-2 text-xs text-right">Total Stock Value</td>
              <td className="px-3 py-2 text-xs text-right font-mono">{fmt(totalStock)}</td>
            </tr>
          }
        />
      </Section>
    </>
  );
}

function ScorecardTab({ d, onFieldSave, onCellSave }: { d: any; onFieldSave: (k: string, v: any) => Promise<void>; onCellSave: (r: number, k: string, v: any) => Promise<void> }) {
  const sc = d.scorecard ?? {};
  const params = sc.parameters ?? [];
  const devs = d.deviations ?? [];

  const paramCols: Column[] = [
    { key: "section", header: "Section" },
    { key: "sr_no", header: "#", width: "40px" },
    { key: "parameter", header: "Parameter" },
    { key: "max_score", header: "Max", align: "right" },
    { key: "criteria", header: "Criteria", editable: true },
    { key: "marks", header: "Marks", align: "right" },
  ];

  const devCols: Column[] = [
    { key: "sl_no", header: "#", width: "40px" },
    { key: "deviation", header: "Deviation" },
    { key: "description", header: "Description", editable: true },
    { key: "mitigants", header: "Mitigants", editable: true },
    { key: "authority", header: "Authority" },
    { key: "status", header: "Status", render: (r) => (
      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
        r.status === "Approved" ? "bg-green-100 text-green-700" :
        r.status === "Pending" ? "bg-yellow-100 text-yellow-700" :
        "bg-gray-100 text-gray-600"
      }`}>{r.status}</span>
    )},
    { key: "approved_by", header: "Approved By" },
    { key: "date", header: "Date" },
  ];

  return (
    <>
      <Section title="Scorecard Summary">
        <div className="flex items-center gap-6 mb-4">
          <div className="text-center">
            <p className="text-3xl font-bold text-gray-900">{sc.total_score ?? "—"}</p>
            <p className="text-xs text-gray-500">Total Score</p>
          </div>
          {sc.risk_band && (
            <span className={`px-4 py-2 rounded-full text-sm font-bold border ${riskBandColor(sc.risk_band)}`}>
              {sc.risk_band}
            </span>
          )}
        </div>
        <DataTable columns={paramCols} data={params} onCellSave={onCellSave} compact />
      </Section>

      <Section title="Deviations">
        <DataTable columns={devCols} data={devs} onCellSave={onCellSave} compact />
      </Section>
    </>
  );
}

function DecisionTab({ d, onFieldSave }: { d: any; onFieldSave: (k: string, v: any) => Promise<void> }) {
  const ir = d.interest_rate ?? {};
  const elig = d.eligibility ?? {};
  const loan = d.loan_final ?? {};
  const conditions = d.sanction_conditions ?? [];
  const pd = d.pd_notes ?? {};
  const purposes = d.loan_purpose ?? [];
  const refs = d.reference_checks ?? [];

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
      {/* Interest Rate */}
      <Section title="Interest Rate">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          <EditableField label="Security Type" value={ir.security_type} fieldKey="interest_rate.security_type" onSave={onFieldSave} />
          <EditableField label="Loan Band" value={ir.loan_band} fieldKey="interest_rate.loan_band" onSave={onFieldSave} />
          <EditableField label="Geography" value={ir.geography} fieldKey="interest_rate.geography" onSave={onFieldSave} />
          <EditableField label="Bureau Band" value={ir.bureau_band} fieldKey="interest_rate.bureau_band" onSave={onFieldSave} />
          <EditableField label="Program" value={ir.program} fieldKey="interest_rate.program" onSave={onFieldSave} />
          <EditableField label="Deviations" value={ir.deviations} fieldKey="interest_rate.deviations" onSave={onFieldSave} />
          <div className="col-span-2 bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-center justify-between">
            <span className="text-sm font-medium text-blue-800">Final Rate</span>
            <span className="text-xl font-bold text-blue-900">{ir.final_rate != null ? `${ir.final_rate}%` : "—"}</span>
          </div>
        </div>
      </Section>

      {/* Eligibility */}
      <Section title="Eligibility Summary">
        <div className="grid grid-cols-3 md:grid-cols-5 gap-3">
          {[
            { label: "Bank Account", value: elig.bank_account },
            { label: "GST Return", value: elig.gst_return },
            { label: "ITR", value: elig.itr },
            { label: "Company Financials", value: elig.company_financials },
            { label: "Income Assessment", value: elig.income_assessment },
            { label: "Max FOIR", value: elig.max_foir, isPct: true },
            { label: "Security", value: elig.security },
            { label: "Recommended", value: elig.recommended },
            { label: "Sanctioned", value: elig.sanctioned },
          ].map((e) => (
            <div key={e.label} className="border rounded-lg p-2.5">
              <p className="text-[10px] text-gray-500 uppercase">{e.label}</p>
              <p className="text-sm font-bold text-gray-900">{e.isPct ? pct(e.value) : fmt(e.value)}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* Final Decision */}
      <Section title="Final Loan Decision">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <MetricCard label="Amount" value={fmt(loan.amount)} color="green" icon={IndianRupee} />
          <MetricCard label="Tenure" value={loan.tenure ? `${loan.tenure} months` : "—"} color="blue" icon={Clock} />
          <MetricCard label="Rate" value={loan.interest_rate != null ? `${loan.interest_rate}%` : "—"} color="yellow" icon={Percent} />
          <MetricCard label="EMI" value={fmt(loan.emi)} color="gray" icon={Calculator} />
        </div>
      </Section>

      {/* Loan Purpose */}
      {purposes.length > 0 && (
        <Section title="Loan Purpose">
          <DataTable columns={purposeCols} data={purposes} compact />
        </Section>
      )}

      {/* Sanction Conditions */}
      <Section title="Sanction Conditions">
        <div className="space-y-2">
          {conditions.length > 0 ? conditions.map((c: string, i: number) => (
            <EditableField
              key={i}
              value={c}
              fieldKey={`sanction_conditions.${i}`}
              onSave={onFieldSave}
              className="w-full"
            />
          )) : <p className="text-sm text-gray-400">No sanction conditions</p>}
        </div>
      </Section>

      {/* PD Notes */}
      <Section title="PD Notes">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {[
            { label: "Residence Ownership", key: "pd_notes.residence_ownership", value: pd.residence_ownership },
            { label: "Residence Doc Type", key: "pd_notes.residence_doc_type", value: pd.residence_doc_type },
            { label: "Business Vintage (Years)", key: "pd_notes.business_vintage_years", value: pd.business_vintage_years },
            { label: "Business Vintage Doc", key: "pd_notes.business_vintage_doc", value: pd.business_vintage_doc },
            { label: "Business Premise Ownership", key: "pd_notes.business_premise_ownership", value: pd.business_premise_ownership },
            { label: "Academic Qualification", key: "pd_notes.academic_qualification", value: pd.academic_qualification },
          ].map((f) => (
            <EditableField key={f.key} label={f.label} value={f.value} fieldKey={f.key} onSave={onFieldSave} />
          ))}
        </div>
        <div className="grid grid-cols-1 gap-3 mt-3">
          {[
            { label: "Borrower Profile", key: "pd_notes.borrower_profile", value: pd.borrower_profile },
            { label: "Household Details", key: "pd_notes.household_details", value: pd.household_details },
            { label: "Income Source", key: "pd_notes.income_source", value: pd.income_source },
            { label: "Bureau Notes", key: "pd_notes.bureau_notes", value: pd.bureau_notes },
            { label: "Others", key: "pd_notes.others", value: pd.others },
          ].map((f) => (
            <EditableField key={f.key} label={f.label} value={f.value} fieldKey={f.key} type="textarea" onSave={onFieldSave} />
          ))}
        </div>
      </Section>

      {/* Reference Checks */}
      {refs.length > 0 && (
        <Section title="Reference Checks">
          <DataTable columns={refCols} data={refs} compact />
        </Section>
      )}
    </>
  );
}
