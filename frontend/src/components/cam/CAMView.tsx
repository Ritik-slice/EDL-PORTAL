import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, CartesianGrid } from "recharts";
import { CheckCircle2, XCircle, AlertTriangle } from "lucide-react";
import { CAMReport } from "../../types";
import { formatCrore, severityColor } from "../../utils/api";

interface Props { report: CAMReport; }

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm space-y-4">
    <h3 className="font-bold text-gray-900 text-base border-b border-gray-100 pb-3">{title}</h3>
    {children}
  </div>
);

const KV = ({ label, value, highlight }: { label: string; value: string | number; highlight?: boolean }) => (
  <div className="flex justify-between items-center py-1.5 border-b border-gray-50">
    <span className="text-sm text-gray-500">{label}</span>
    <span className={`text-sm font-semibold ${highlight ? "text-blue-600" : "text-gray-900"}`}>{value}</span>
  </div>
);

export default function CAMView({ report }: Props) {
  const rec = report.recommendation;
  const recStyle = rec === "approve"
    ? "bg-green-50 border-green-400 text-green-800"
    : rec === "decline"
    ? "bg-red-50 border-red-400 text-red-800"
    : "bg-yellow-50 border-yellow-400 text-yellow-800";

  const recIcon = rec === "approve"
    ? <CheckCircle2 size={22} />
    : rec === "decline"
    ? <XCircle size={22} />
    : <AlertTriangle size={22} />;

  const financialYears = report.financial_analysis?.years ?? [];
  const monthlyCash = report.banking_behaviour?.monthly_summaries ?? [];

  return (
    <div className="space-y-6">
      {/* Header band */}
      <div className="bg-gradient-to-r from-blue-700 to-blue-500 text-white rounded-2xl p-6">
        <div className="flex justify-between items-start">
          <div>
            <p className="text-blue-100 text-xs font-semibold uppercase tracking-wide mb-1">Credit Appraisal Memorandum v{report.version}</p>
            <h2 className="text-xl font-bold">{report.borrower_profile?.name as string}</h2>
            <p className="text-blue-200 text-sm mt-1">
              {formatCrore(report.borrower_profile?.loan_amount_requested as number)} · {report.borrower_profile?.loan_type as string}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-blue-200">Generated</p>
            <p className="text-sm font-medium">{new Date(report.generated_at).toLocaleDateString("en-IN")}</p>
          </div>
        </div>
      </div>

      {/* Executive Summary */}
      <Section title="Executive Summary">
        <p className="text-gray-700 text-sm leading-relaxed">{report.executive_summary}</p>
      </Section>

      {/* Recommendation */}
      <div className={`px-6 py-5 rounded-2xl border-2 ${recStyle}`}>
        <div className="flex items-center gap-3 mb-2">
          {recIcon}
          <span className="font-bold text-lg">Recommendation: {rec.toUpperCase()}</span>
        </div>
        <p className="text-sm opacity-90 leading-relaxed">{report.recommendation_rationale}</p>
      </div>

      {/* Financial Analysis */}
      {financialYears.length > 0 && (
        <Section title="Financial Analysis">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50">
                  <th className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase">Metric</th>
                  {financialYears.map((y) => (
                    <th key={y.year} className="text-right px-3 py-2 text-xs font-semibold text-gray-500 uppercase">{y.year}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  { label: "Revenue", key: "revenue", fmt: formatCrore },
                  { label: "EBITDA", key: "ebitda", fmt: formatCrore },
                  { label: "EBITDA Margin", key: "ebitda_margin_pct", fmt: (v: number) => `${v}%` },
                  { label: "PAT", key: "pat", fmt: formatCrore },
                  { label: "Total Debt", key: "total_debt", fmt: formatCrore },
                  { label: "Net Worth", key: "net_worth", fmt: formatCrore },
                  { label: "Current Ratio", key: "current_ratio", fmt: (v: number) => v.toFixed(2) },
                  { label: "D/E Ratio", key: "debt_equity_ratio", fmt: (v: number) => v.toFixed(2) },
                  { label: "DSCR", key: "dscr", fmt: (v: number) => v.toFixed(2) },
                  { label: "Debtor Days", key: "debtor_days", fmt: (v: number) => `${Math.round(v)} days` },
                ].map(({ label, key, fmt }) => (
                  <tr key={key} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="px-3 py-2 text-gray-600 font-medium">{label}</td>
                    {financialYears.map((y) => {
                      const val = (y as Record<string, number>)[key];
                      return (
                        <td key={y.year} className="px-3 py-2 text-right font-mono text-gray-900 text-sm">
                          {val !== undefined ? fmt(val) : "—"}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {financialYears.length >= 2 && (
            <div className="h-48 mt-4">
              <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Revenue Trend</p>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={financialYears}>
                  <XAxis dataKey="year" tick={{ fontSize: 11 }} />
                  <YAxis tickFormatter={(v) => formatCrore(v)} tick={{ fontSize: 10 }} width={70} />
                  <Tooltip formatter={(v) => formatCrore(v as number)} />
                  <Bar dataKey="revenue" fill="#2563eb" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="pat" fill="#16a34a" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Section>
      )}

      {/* Banking Behaviour */}
      {report.banking_behaviour?.bank_name && (
        <Section title="Banking Behaviour">
          <div className="grid grid-cols-2 gap-x-8">
            <div>
              <KV label="Bank" value={report.banking_behaviour.bank_name} />
              <KV label="Avg Monthly Credits" value={formatCrore(report.banking_behaviour.average_monthly_credit)} highlight />
              <KV label="Avg EOD Balance" value={formatCrore(report.banking_behaviour.average_eod_balance)} />
              <KV label="Cheque Bounces" value={report.banking_behaviour.bounce_count_12m} />
            </div>
            <div>
              <KV label="Monthly EMI Obligations" value={formatCrore(report.banking_behaviour.emi_obligations_monthly)} />
              <KV label="Cash Withdrawal %" value={`${report.banking_behaviour.cash_withdrawal_pct}%`} />
            </div>
          </div>
          <p className="text-sm text-gray-600 bg-gray-50 rounded-xl p-4 leading-relaxed mt-2">{report.banking_behaviour.commentary}</p>
          {monthlyCash.length >= 3 && (
            <div className="h-44 mt-2">
              <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Monthly Cash Flow</p>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={monthlyCash}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                  <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                  <YAxis tickFormatter={(v) => formatCrore(v)} tick={{ fontSize: 10 }} width={70} />
                  <Tooltip formatter={(v) => formatCrore(v as number)} />
                  <Line dataKey="credits" stroke="#2563eb" dot={false} strokeWidth={2} />
                  <Line dataKey="debits" stroke="#ef4444" dot={false} strokeWidth={2} strokeDasharray="4 2" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </Section>
      )}

      {/* GST Compliance */}
      {report.gst_compliance?.gstin && (
        <Section title="GST & Tax Compliance">
          <div className="grid grid-cols-2 gap-x-8">
            <div>
              <KV label="GSTIN" value={report.gst_compliance.gstin} />
              <KV label="Annual Turnover" value={formatCrore(report.gst_compliance.annual_turnover)} highlight />
              <KV label="Avg Monthly Turnover" value={formatCrore(report.gst_compliance.average_monthly_turnover)} />
            </div>
            <div>
              <KV label="Filing Regularity" value={`${report.gst_compliance.filing_regularity_pct}%`} />
              <KV label="GST–Bank Match" value={report.gst_compliance.gst_bank_match_pct ? `${report.gst_compliance.gst_bank_match_pct}%` : "—"} />
              <KV label="Missing Periods" value={report.gst_compliance.missing_periods.length === 0 ? "None" : report.gst_compliance.missing_periods.join(", ")} />
            </div>
          </div>
          <p className="text-sm text-gray-600 bg-gray-50 rounded-xl p-4 leading-relaxed">{report.gst_compliance.commentary}</p>
        </Section>
      )}

      {/* Bureau Summary */}
      {report.bureau_summary?.score && (
        <Section title="Credit Bureau Summary">
          <div className="grid grid-cols-2 gap-x-8">
            <div>
              <KV label="Bureau" value={report.bureau_summary.bureau} />
              <KV label="Score" value={report.bureau_summary.score} highlight />
              <KV label="Active Accounts" value={report.bureau_summary.total_active_accounts} />
              <KV label="Total Exposure" value={formatCrore(report.bureau_summary.total_exposure)} />
            </div>
            <div>
              <KV label="Worst DPD" value={`${report.bureau_summary.worst_dpd} days`} />
              <KV label="Written Off" value={report.bureau_summary.written_off ? "Yes ⚠️" : "No"} />
              <KV label="Suit Filed" value={report.bureau_summary.suit_filed ? "Yes ⚠️" : "No"} />
              <KV label="Enquiries (6M)" value={report.bureau_summary.enquiries_6m} />
            </div>
          </div>
          <p className="text-sm text-gray-600 bg-gray-50 rounded-xl p-4 leading-relaxed">{report.bureau_summary.commentary}</p>
        </Section>
      )}

      {/* Risk Flags */}
      {report.risk_flags?.length > 0 && (
        <Section title="Risk Flags">
          <div className="space-y-2">
            {report.risk_flags.map((f, i) => (
              <div key={i} className={`px-4 py-3 border rounded-xl text-sm flex items-start gap-3 ${severityColor(f.severity)}`}>
                <span className="font-bold uppercase text-xs mt-0.5 flex-shrink-0 w-16">{f.severity}</span>
                <div>
                  <span className="font-semibold">{f.code.replace(/_/g, " ")}: </span>
                  {f.message}
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Proposed Structure */}
      {report.proposed_structure && (
        <Section title="Proposed Loan Structure">
          <div className="grid grid-cols-2 gap-x-8">
            <KV label="Loan Amount" value={formatCrore(report.proposed_structure.loan_amount)} highlight />
            <KV label="Tenor" value={`${report.proposed_structure.tenor_months} months`} />
            <KV label="Suggested Rate" value={report.proposed_structure.suggested_rate_range} />
            <KV label="Loan Type" value={report.proposed_structure.loan_type} />
          </div>
          <div className="mt-4">
            <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Recommended Covenants</p>
            <ul className="space-y-2">
              {report.proposed_structure.recommended_covenants.map((c, i) => (
                <li key={i} className="text-sm text-gray-700 flex gap-2">
                  <span className="text-blue-400 font-bold mt-0.5">·</span> {c}
                </li>
              ))}
            </ul>
          </div>
        </Section>
      )}
    </div>
  );
}
