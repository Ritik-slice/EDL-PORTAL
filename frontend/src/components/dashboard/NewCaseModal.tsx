import { useState } from "react";
import { X } from "lucide-react";
import api from "../../utils/api";

interface Props {
  onClose: () => void;
  onCreated: (caseId: string) => void;
}

export default function NewCaseModal({ onClose, onCreated }: Props) {
  const [form, setForm] = useState({
    borrower_name: "",
    borrower_pan: "",
    borrower_gstin: "",
    borrower_entity_type: "pvt_ltd",
    industry: "",
    loan_amount_requested: "",
    loan_type: "term_loan",
    loan_purpose: "",
    loan_tenor_months: "60",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const { data } = await api.post("/cases", {
        ...form,
        loan_amount_requested: parseFloat(form.loan_amount_requested),
        loan_tenor_months: parseInt(form.loan_tenor_months),
      });
      onCreated(data.id);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(msg || "Failed to create case");
    } finally {
      setLoading(false);
    }
  };

  const field = (label: string, key: keyof typeof form, type = "text", placeholder = "") => (
    <div>
      <label className="block text-xs font-semibold text-gray-600 mb-1">{label}</label>
      <input
        type={type} value={form[key]} placeholder={placeholder}
        onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-900">New Loan Case</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            {field("Borrower Name *", "borrower_name", "text", "Rajesh Traders Pvt Ltd")}
            {field("PAN", "borrower_pan", "text", "AABCR1234D")}
            {field("GSTIN", "borrower_gstin", "text", "27AABCR1234D1Z5")}
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Entity Type</label>
              <select
                value={form.borrower_entity_type}
                onChange={(e) => setForm((f) => ({ ...f, borrower_entity_type: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="pvt_ltd">Private Limited</option>
                <option value="proprietorship">Proprietorship</option>
                <option value="partnership">Partnership</option>
                <option value="llp">LLP</option>
              </select>
            </div>
            {field("Industry", "industry", "text", "Manufacturing")}
            {field("Loan Amount (₹) *", "loan_amount_requested", "number", "8500000")}
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Loan Type</label>
              <select
                value={form.loan_type}
                onChange={(e) => setForm((f) => ({ ...f, loan_type: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="term_loan">Term Loan</option>
                <option value="working_capital">Working Capital</option>
                <option value="overdraft">Overdraft</option>
                <option value="cc_limit">CC Limit</option>
              </select>
            </div>
            {field("Tenor (months)", "loan_tenor_months", "number", "60")}
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Loan Purpose</label>
            <textarea
              value={form.loan_purpose}
              onChange={(e) => setForm((f) => ({ ...f, loan_purpose: e.target.value }))}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              rows={2}
              placeholder="Expansion of manufacturing unit and working capital requirements"
            />
          </div>

          {error && <p className="text-red-600 text-sm bg-red-50 px-4 py-2 rounded-lg">{error}</p>}

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="px-5 py-2 border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50">
              Cancel
            </button>
            <button type="submit" disabled={loading || !form.borrower_name || !form.loan_amount_requested}
              className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold disabled:opacity-50 transition">
              {loading ? "Creating..." : "Create Case"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
