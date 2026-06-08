import { useState } from "react";
import { X, Loader, Zap, Key } from "lucide-react";
import api from "../../utils/api";

interface Props {
  onClose: () => void;
  onFetched: (caseId: string) => void;
}

export default function FetchAppModal({ onClose, onFetched }: Props) {
  const [appId, setAppId] = useState("");
  const [token, setToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");

  const handleFetch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!appId.trim()) return;
    setLoading(true);
    setError("");
    setStatus("Connecting to Slice APIs...");

    try {
      const body: Record<string, string> = { app_id: appId.trim() };
      if (token.trim()) body.access_token = token.trim();

      setStatus("Fetching business details, bureau, banking, eligibility...");
      const { data } = await api.post("/slice/fetch", body, { timeout: 60000 });

      const successful = data.apis_successful?.length || 0;
      const failed = data.apis_failed?.length || 0;
      setStatus(`Done! ${successful} APIs successful${failed ? `, ${failed} failed` : ""}`);

      setTimeout(() => onFetched(data.case_id), 500);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      if (msg?.includes("Authentication")) {
        setError("Authentication failed. The access token is expired or invalid. Please provide a fresh token.");
        setShowToken(true);
      } else {
        setError(msg || "Failed to fetch data from Slice APIs");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
        <div className="flex items-center justify-between p-6 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <Zap size={18} className="text-blue-600" />
            <h2 className="text-lg font-bold text-gray-900">Fetch from Slice</h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>

        <form onSubmit={handleFetch} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">Application ID *</label>
            <input
              type="text"
              value={appId}
              onChange={(e) => setAppId(e.target.value)}
              placeholder="app_6Mm7fRuD68KXZw"
              className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
              autoFocus
            />
            <p className="text-xs text-gray-400 mt-1">Enter the Slice application ID (starts with app_)</p>
          </div>

          {showToken && (
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5 flex items-center gap-1">
                <Key size={12} /> Access Token (optional override)
              </label>
              <input
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="Paste fresh a-access-token here"
                className="w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
              />
              <p className="text-xs text-gray-400 mt-1">Override the default token if it's expired</p>
            </div>
          )}

          {!showToken && (
            <button
              type="button"
              onClick={() => setShowToken(true)}
              className="text-xs text-blue-600 hover:text-blue-800 font-medium"
            >
              + Add custom access token
            </button>
          )}

          {error && (
            <div className="px-4 py-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm">{error}</div>
          )}

          {status && !error && (
            <div className="px-4 py-3 bg-blue-50 border border-blue-200 text-blue-700 rounded-xl text-sm flex items-center gap-2">
              {loading && <Loader size={14} className="animate-spin" />}
              {status}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="px-5 py-2.5 border border-gray-200 rounded-xl text-sm font-semibold text-gray-600 hover:bg-gray-50">
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !appId.trim()}
              className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-semibold disabled:opacity-50 transition flex items-center gap-2"
            >
              {loading ? <><Loader size={14} className="animate-spin" /> Fetching...</> : <><Zap size={14} /> Fetch Data</>}
            </button>
          </div>

          <p className="text-xs text-gray-400 text-center pt-2">
            Calls: Business Details · Bureau · Banking (AA) · GST · Eligibility
          </p>
        </form>
      </div>
    </div>
  );
}
