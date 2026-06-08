import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { Plus, FileText, TrendingUp, AlertTriangle, CheckCircle, Zap } from "lucide-react";
import api, { formatCrore, gradeColor } from "../utils/api";
import { Case } from "../types";
import NewCaseModal from "../components/dashboard/NewCaseModal";
import FetchAppModal from "../components/dashboard/FetchAppModal";

const statusLabel: Record<string, { label: string; color: string }> = {
  created: { label: "Created", color: "bg-gray-100 text-gray-600" },
  documents_uploaded: { label: "Docs Uploaded", color: "bg-blue-100 text-blue-600" },
  parsing: { label: "Parsing", color: "bg-yellow-100 text-yellow-700" },
  cam_ready: { label: "CAM Ready", color: "bg-green-100 text-green-700" },
  approved: { label: "Approved", color: "bg-emerald-100 text-emerald-700" },
  declined: { label: "Declined", color: "bg-red-100 text-red-700" },
  under_review: { label: "Under Review", color: "bg-purple-100 text-purple-700" },
};

export default function Dashboard() {
  const navigate = useNavigate();
  const [showNewCase, setShowNewCase] = useState(false);
  const [showFetchApp, setShowFetchApp] = useState(false);

  const { data: cases = [], refetch } = useQuery<Case[]>({
    queryKey: ["cases"],
    queryFn: () => api.get("/cases").then((r) => r.data),
  });

  const stats = {
    total: cases.length,
    camReady: cases.filter((c) => c.status === "cam_ready" || c.status === "approved").length,
    approved: cases.filter((c) => c.status === "approved").length,
    gradeA: cases.filter((c) => c.risk_signals?.risk_grade === "A").length,
  };

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Loan Cases</h1>
          <p className="text-gray-500 text-sm mt-1">Manage and track credit appraisals</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => setShowFetchApp(true)}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl font-semibold text-sm transition"
          >
            <Zap size={16} /> Fetch by App ID
          </button>
          <button
            onClick={() => setShowNewCase(true)}
            className="flex items-center gap-2 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 px-5 py-2.5 rounded-xl font-semibold text-sm transition"
          >
            <Plus size={16} /> Manual Case
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-5 mb-8">
        {[
          { label: "Total Cases", value: stats.total, icon: FileText, color: "text-blue-600" },
          { label: "CAM Generated", value: stats.camReady, icon: TrendingUp, color: "text-purple-600" },
          { label: "Approved", value: stats.approved, icon: CheckCircle, color: "text-green-600" },
          { label: "Grade A Cases", value: stats.gradeA, icon: AlertTriangle, color: "text-emerald-600" },
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
              <th className="text-left px-6 py-4 font-semibold text-gray-500 uppercase text-xs tracking-wide">Case Ref</th>
              <th className="text-left px-6 py-4 font-semibold text-gray-500 uppercase text-xs tracking-wide">Borrower</th>
              <th className="text-left px-6 py-4 font-semibold text-gray-500 uppercase text-xs tracking-wide">Loan Ask</th>
              <th className="text-left px-6 py-4 font-semibold text-gray-500 uppercase text-xs tracking-wide">Risk Grade</th>
              <th className="text-left px-6 py-4 font-semibold text-gray-500 uppercase text-xs tracking-wide">Status</th>
              <th className="text-left px-6 py-4 font-semibold text-gray-500 uppercase text-xs tracking-wide">Created</th>
            </tr>
          </thead>
          <tbody>
            {cases.length === 0 && (
              <tr>
                <td colSpan={6} className="text-center py-16 text-gray-400">
                  No cases yet. Click <strong>New Case</strong> to get started.
                </td>
              </tr>
            )}
            {cases.map((c) => {
              const grade = c.risk_signals?.risk_grade;
              const st = statusLabel[c.status] ?? { label: c.status, color: "bg-gray-100 text-gray-600" };
              return (
                <tr
                  key={c.id}
                  onClick={() => navigate(`/cases/${c.id}`)}
                  className="border-b border-gray-50 hover:bg-blue-50 cursor-pointer transition"
                >
                  <td className="px-6 py-4 font-mono font-semibold text-blue-600">{c.case_ref}</td>
                  <td className="px-6 py-4 font-medium text-gray-900">{c.borrower_name}</td>
                  <td className="px-6 py-4 text-gray-700">{formatCrore(c.loan_amount_requested)}</td>
                  <td className="px-6 py-4">
                    {grade ? (
                      <span className={`font-bold px-2.5 py-1 rounded-lg text-xs ${gradeColor(grade)}`}>
                        Grade {grade}
                      </span>
                    ) : (
                      <span className="text-gray-300 text-xs">—</span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${st.color}`}>
                      {st.label}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-gray-400 text-xs">
                    {new Date(c.created_at).toLocaleDateString("en-IN")}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {showNewCase && (
        <NewCaseModal onClose={() => setShowNewCase(false)} onCreated={(id) => { refetch(); navigate(`/cases/${id}`); }} />
      )}

      {showFetchApp && (
        <FetchAppModal
          onClose={() => setShowFetchApp(false)}
          onFetched={(caseId) => { refetch(); setShowFetchApp(false); navigate(`/cases/${caseId}/cam-detail`); }}
        />
      )}
    </div>
  );
}
