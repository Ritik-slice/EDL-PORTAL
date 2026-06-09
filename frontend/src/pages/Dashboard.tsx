import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { FileText, TrendingUp, CheckCircle, XCircle, Shield, IndianRupee } from "lucide-react";
import api, { formatCrore, gradeColor } from "../utils/api";
import { Case } from "../types";

const statusLabel: Record<string, { label: string; color: string }> = {
  created: { label: "Created", color: "bg-gray-100 text-gray-600" },
  documents_uploaded: { label: "Docs Uploaded", color: "bg-blue-100 text-blue-600" },
  cam_ready: { label: "CAM Ready", color: "bg-green-100 text-green-700" },
  approved: { label: "Approved", color: "bg-emerald-100 text-emerald-700" },
  declined: { label: "Declined", color: "bg-red-100 text-red-700" },
  under_review: { label: "Under Review", color: "bg-purple-100 text-purple-700" },
};

export default function Dashboard() {
  const navigate = useNavigate();

  const { data: cases = [] } = useQuery<Case[]>({
    queryKey: ["cases"],
    queryFn: () => api.get("/cases").then((r) => r.data),
  });

  const stats = {
    total: cases.length,
    camReady: cases.filter((c) => c.status === "cam_ready").length,
    approved: cases.filter((c) => (c.risk_signals as any)?.recommendation === "approve").length,
    rejected: cases.filter((c) => (c.risk_signals as any)?.recommendation === "decline").length,
  };

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">EDL Applications</h1>
        <p className="text-gray-500 text-sm mt-1">Credit Appraisal Memorandum workspace</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-5 mb-8">
        {[
          { label: "Total Cases", value: stats.total, icon: FileText, color: "text-blue-600" },
          { label: "CAM Ready", value: stats.camReady, icon: TrendingUp, color: "text-purple-600" },
          { label: "Approved", value: stats.approved, icon: CheckCircle, color: "text-green-600" },
          { label: "Rejected", value: stats.rejected, icon: XCircle, color: "text-red-600" },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">{label}</p>
                <p className="text-3xl font-bold text-gray-900 mt-1">{value}</p>
              </div>
              <Icon className={`${color} opacity-80`} size={28} />
            </div>
          </div>
        ))}
      </div>

      {/* Cases Table */}
      <div className="bg-white border border-gray-100 rounded-2xl shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="text-left px-6 py-4 font-semibold text-gray-500 uppercase text-xs tracking-wide">App ID</th>
              <th className="text-left px-6 py-4 font-semibold text-gray-500 uppercase text-xs tracking-wide">Borrower</th>
              <th className="text-left px-6 py-4 font-semibold text-gray-500 uppercase text-xs tracking-wide">Loan Type</th>
              <th className="text-right px-6 py-4 font-semibold text-gray-500 uppercase text-xs tracking-wide">Loan Ask</th>
              <th className="text-center px-6 py-4 font-semibold text-gray-500 uppercase text-xs tracking-wide">Bureau</th>
              <th className="text-center px-6 py-4 font-semibold text-gray-500 uppercase text-xs tracking-wide">Grade</th>
              <th className="text-right px-6 py-4 font-semibold text-gray-500 uppercase text-xs tracking-wide">Sanctioned</th>
              <th className="text-center px-6 py-4 font-semibold text-gray-500 uppercase text-xs tracking-wide">Status</th>
            </tr>
          </thead>
          <tbody>
            {cases.length === 0 && (
              <tr><td colSpan={8} className="text-center py-16 text-gray-400">No cases loaded. Run seed script to load CAM data.</td></tr>
            )}
            {cases.map((c) => {
              const rs = (c.risk_signals ?? {}) as any;
              const grade = rs.risk_grade;
              const st = statusLabel[c.status] ?? { label: c.status, color: "bg-gray-100 text-gray-600" };
              const sanctioned = rs.final_loan_amount;
              return (
                <tr key={c.id} onClick={() => navigate(`/cases/${c.id}/cam-detail`)}
                  className="border-b border-gray-50 hover:bg-blue-50 cursor-pointer transition">
                  <td className="px-6 py-4 font-mono text-xs text-blue-600 font-semibold">{c.case_ref}</td>
                  <td className="px-6 py-4 font-medium text-gray-900">{c.borrower_name}</td>
                  <td className="px-6 py-4 text-gray-500 text-xs">{(c as any).loan_type?.replace("_", " ")}</td>
                  <td className="px-6 py-4 text-right font-mono text-gray-700">{formatCrore(c.loan_amount_requested)}</td>
                  <td className="px-6 py-4 text-center">
                    {rs.bureau_score ? (
                      <span className={`font-bold text-xs px-2 py-1 rounded-lg ${rs.bureau_score >= 700 ? "bg-green-50 text-green-700" : rs.bureau_score >= 650 ? "bg-blue-50 text-blue-700" : "bg-red-50 text-red-700"}`}>{rs.bureau_score}</span>
                    ) : <span className="text-gray-300 text-xs">—</span>}
                  </td>
                  <td className="px-6 py-4 text-center">
                    {grade ? (
                      <span className={`font-bold px-2.5 py-1 rounded-lg text-xs ${gradeColor(grade)}`}>Grade {grade}</span>
                    ) : <span className="text-gray-300 text-xs">—</span>}
                  </td>
                  <td className="px-6 py-4 text-right font-mono">
                    {sanctioned && sanctioned !== "Reject" ? (
                      <span className="text-green-700 font-semibold">{formatCrore(sanctioned)}</span>
                    ) : sanctioned === "Reject" ? (
                      <span className="text-red-600 font-semibold text-xs bg-red-50 px-2 py-1 rounded">Rejected</span>
                    ) : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-6 py-4 text-center">
                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${st.color}`}>{st.label}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
