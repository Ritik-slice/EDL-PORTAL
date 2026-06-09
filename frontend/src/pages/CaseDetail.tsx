import { useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useDropzone } from "react-dropzone";
import {
  ArrowLeft, Upload, Eye, Loader, FileText, CheckCircle2, XCircle,
  Image, FileSpreadsheet, File, AlertTriangle, Trash2,
} from "lucide-react";
import api, { formatCrore, gradeColor } from "../utils/api";
import { Case, Document } from "../types";

const DOC_TYPES = [
  { value: "bank_statement", label: "Bank Statement", desc: "PDF/Excel bank statements — extracts transactions, cash flow, balances" },
  { value: "gst_return", label: "GST Return", desc: "GST portal JSON/PDF — extracts GSTIN, filings, turnover" },
  { value: "financial_statement", label: "Financial Statement", desc: "P&L and Balance Sheet — extracts ratios, turnover, profit" },
  { value: "bureau_report", label: "Bureau Report", desc: "CIBIL/Experian/Equifax PDF — extracts score, tradelines, DPD" },
  { value: "itr", label: "ITR / Form 26AS", desc: "Income tax returns — extracts business income, filing dates" },
  { value: "kyc", label: "KYC / Business Docs", desc: "PAN, Aadhaar, Udyam, Trade License, Premises photos" },
  { value: "stock_declaration", label: "Stock Declaration", desc: "Stock/inventory declaration — extracts item details, quantities, values" },
  { value: "other", label: "Other Documents", desc: "Any other supporting documents" },
];

const fileIcon = (name: string) => {
  if (name.match(/\.(jpg|jpeg|png|gif)$/i)) return <Image size={14} className="text-purple-500" />;
  if (name.match(/\.(xlsx|xls|csv)$/i)) return <FileSpreadsheet size={14} className="text-green-500" />;
  if (name.match(/\.pdf$/i)) return <FileText size={14} className="text-red-500" />;
  return <File size={14} className="text-gray-400" />;
};

export default function CaseDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [docType, setDocType] = useState("bank_statement");
  const [uploadError, setUploadError] = useState("");

  const { data: caseData, refetch: refetchCase } = useQuery<Case>({
    queryKey: ["case", id],
    queryFn: () => api.get(`/cases/${id}`).then((r) => r.data),
  });

  const { data: documents = [], refetch: refetchDocs } = useQuery<Document[]>({
    queryKey: ["docs", id],
    queryFn: () => api.get(`/cases/${id}/documents`).then((r) => r.data),
  });

  const { data: camData } = useQuery({
    queryKey: ["cam-data", id],
    queryFn: () => api.get(`/cases/${id}/cam-data`).then((r) => r.data).catch(() => null),
    retry: false,
  });

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("doc_type", docType);
      return api.post(`/cases/${id}/documents`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
        timeout: 60000,
      }).then((r) => r.data);
    },
    onSuccess: (data) => {
      setUploadError("");
      qc.invalidateQueries({ queryKey: ["docs", id] });
      qc.invalidateQueries({ queryKey: ["case", id] });
      qc.invalidateQueries({ queryKey: ["cam-data", id] });
      refetchDocs();
    },
    onError: (err: unknown) => {
      const msg = (err as any)?.response?.data?.detail;
      setUploadError(msg || "Upload failed");
    },
  });

  const onDrop = useCallback((files: File[]) => {
    files.forEach((file) => {
      setUploadError("");
      uploadMutation.mutate(file);
    });
  }, [uploadMutation, docType]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    multiple: true,
    accept: {
      "application/pdf": [".pdf"],
      "application/json": [".json"],
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
      "application/vnd.ms-excel": [".xls"],
      "text/csv": [".csv"],
      "image/jpeg": [".jpg", ".jpeg"],
      "image/png": [".png"],
    },
  });

  if (!caseData) return <div className="p-8 text-gray-400">Loading...</div>;

  const signals = caseData.risk_signals as any;
  const hasCamData = !!camData;

  // Group documents by type
  const docsByType: Record<string, Document[]> = {};
  documents.forEach((d) => {
    const t = d.doc_type || "other";
    if (!docsByType[t]) docsByType[t] = [];
    docsByType[t].push(d);
  });

  const completedCount = documents.filter((d) => d.parse_status === "completed").length;
  const failedCount = documents.filter((d) => d.parse_status === "failed").length;

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-start gap-4 mb-6">
        <button onClick={() => navigate("/")} className="mt-1 text-gray-400 hover:text-gray-700 transition">
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">{caseData.borrower_name}</h1>
            {signals?.risk_grade && (
              <span className={`font-bold px-3 py-1 rounded-lg text-sm ${gradeColor(signals.risk_grade)}`}>Grade {signals.risk_grade}</span>
            )}
            {signals?.score_risk_band && (
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-yellow-100 text-yellow-700">{signals.score_risk_band}</span>
            )}
          </div>
          <p className="text-gray-500 text-sm mt-1">
            {caseData.case_ref} · {formatCrore(caseData.loan_amount_requested)} · {(caseData.loan_type as string)?.replace("_", " ")}
          </p>
        </div>

        {hasCamData && (
          <button onClick={() => navigate(`/cases/${id}/cam-detail`)}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl font-semibold text-sm transition">
            <Eye size={15} /> View CAM Report
          </button>
        )}
      </div>

      {/* Key metrics from auto-populated data */}
      {signals && (
        <div className="grid grid-cols-5 gap-3 mb-6">
          {[
            { label: "Bureau Score", value: signals.bureau_score ?? "—", ok: (signals.bureau_score ?? 0) >= 700 },
            { label: "Loan Amount", value: signals.final_loan_amount ? formatCrore(signals.final_loan_amount) : "—" },
            { label: "Interest Rate", value: signals.final_rate ? `${(signals.final_rate * 100).toFixed(1)}%` : "—" },
            { label: "EMI", value: signals.final_emi ? formatCrore(signals.final_emi) : "—" },
            { label: "FOIR", value: signals.final_foir ? `${(signals.final_foir * 100).toFixed(1)}%` : "—", ok: (signals.final_foir ?? 1) <= 0.6 },
          ].map(({ label, value, ok }) => (
            <div key={label} className="bg-white border border-gray-100 rounded-xl p-4 shadow-sm">
              <p className="text-[10px] text-gray-500 font-semibold uppercase tracking-wide mb-1">{label}</p>
              <div className="flex items-center gap-2">
                <span className="text-lg font-bold text-gray-900">{value}</span>
                {value !== "—" && ok !== undefined && (ok ? <CheckCircle2 size={14} className="text-green-500" /> : <XCircle size={14} className="text-red-500" />)}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* LEFT: Document Upload */}
        <div className="lg:col-span-2 space-y-5">
          <div className="bg-white border border-gray-100 rounded-xl p-6 shadow-sm">
            <h3 className="font-bold text-gray-900 mb-1">Upload Documents</h3>
            <p className="text-gray-500 text-xs mb-4">
              Upload bank statements, GST returns, ITR, bureau reports, stock declarations, and other documents.
              Each document will be <strong>automatically parsed</strong> and the extracted data will populate the CAM fields.
            </p>

            {/* Document type selector */}
            <div className="mb-4">
              <label className="block text-xs font-semibold text-gray-600 mb-2">Document Type</label>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {DOC_TYPES.map((dt) => (
                  <button key={dt.value} onClick={() => setDocType(dt.value)}
                    className={`text-left px-3 py-2 rounded-lg text-xs border transition ${
                      docType === dt.value ? "bg-blue-600 text-white border-blue-600" : "bg-white text-gray-600 border-gray-200 hover:border-blue-300"
                    }`}>
                    <span className="font-semibold block">{dt.label}</span>
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-gray-400 mt-1.5">{DOC_TYPES.find(d => d.value === docType)?.desc}</p>
            </div>

            {/* Drop zone */}
            <div {...getRootProps()}
              className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition ${
                isDragActive ? "border-blue-500 bg-blue-50" : "border-gray-200 hover:border-blue-300 hover:bg-gray-50"
              } ${uploadMutation.isPending ? "opacity-50 pointer-events-none" : ""}`}>
              <input {...getInputProps()} />
              {uploadMutation.isPending ? (
                <div className="flex flex-col items-center gap-2">
                  <Loader size={28} className="text-blue-500 animate-spin" />
                  <p className="text-blue-600 font-semibold text-sm">Parsing document & extracting data...</p>
                </div>
              ) : (
                <>
                  <Upload size={28} className="mx-auto mb-2 text-gray-300" />
                  <p className="text-gray-600 font-semibold text-sm">Drop files here or click to browse</p>
                  <p className="text-gray-400 text-xs mt-1">PDF, Excel, CSV, JSON, JPG, PNG — multiple files supported</p>
                </>
              )}
            </div>

            {uploadError && (
              <div className="mt-3 px-4 py-2 bg-red-50 border border-red-200 text-red-700 rounded-lg text-xs flex items-center gap-2">
                <AlertTriangle size={14} /> {uploadError}
              </div>
            )}
          </div>

          {/* Uploaded documents grouped by type */}
          {documents.length > 0 && (
            <div className="bg-white border border-gray-100 rounded-xl p-6 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-gray-900">Documents ({documents.length})</h3>
                <div className="flex gap-3 text-xs">
                  <span className="text-green-600 font-semibold">{completedCount} parsed</span>
                  {failedCount > 0 && <span className="text-red-600 font-semibold">{failedCount} failed</span>}
                </div>
              </div>

              {Object.entries(docsByType).map(([type, docs]) => (
                <div key={type} className="mb-4 last:mb-0">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 border-b border-gray-100 pb-1">
                    {type.replace(/_/g, " ")} ({docs.length})
                  </p>
                  <div className="space-y-1">
                    {docs.map((doc) => (
                      <div key={doc.id} className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-50 transition">
                        {fileIcon(doc.filename)}
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium text-gray-800 truncate">{doc.filename}</p>
                        </div>
                        {doc.parse_status === "completed" ? (
                          <span className="flex items-center gap-1 text-[10px] text-green-600 font-semibold">
                            <CheckCircle2 size={12} /> Parsed
                          </span>
                        ) : doc.parse_status === "failed" ? (
                          <span className="flex items-center gap-1 text-[10px] text-red-500 font-semibold">
                            <XCircle size={12} /> Failed
                          </span>
                        ) : (
                          <Loader size={12} className="text-blue-500 animate-spin" />
                        )}
                        {doc.extraction_confidence != null && (
                          <span className="text-[10px] text-gray-400">{(doc.extraction_confidence * 100).toFixed(0)}%</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* RIGHT: CAM Status & Quick View */}
        <div className="space-y-5">
          {/* CAM Status */}
          <div className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm">
            <h3 className="font-bold text-gray-900 mb-3">CAM Status</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500">Auto-populated (APIs)</span>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${hasCamData ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                  {hasCamData ? "Loaded" : "Pending"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500">Documents uploaded</span>
                <span className="text-xs font-bold text-gray-900">{documents.length}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500">Documents parsed</span>
                <span className="text-xs font-bold text-green-700">{completedCount}</span>
              </div>
            </div>

            {hasCamData && (
              <button onClick={() => navigate(`/cases/${id}/cam-detail`)}
                className="mt-4 w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white py-2.5 rounded-xl font-semibold text-sm transition">
                <Eye size={14} /> Open CAM Report
              </button>
            )}
          </div>

          {/* Data source indicators */}
          <div className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm">
            <h3 className="font-bold text-gray-900 mb-3">Data Sources</h3>
            <div className="space-y-2">
              {[
                { label: "Application Details", filled: !!camData?.application?.applicant_name, source: "API" },
                { label: "Bureau Scores", filled: !!camData?.bureau?.scores?.some((s: any) => s.score), source: "API" },
                { label: "Banking Analysis", filled: !!camData?.output?.combined_bto, source: "API" },
                { label: "GST Returns", filled: !!camData?.gst?.manual_pull?.gstin, source: docsByType["gst_return"]?.length ? "Document" : "Pending" },
                { label: "Financial Statements", filled: !!camData?.output?.turnover_previous_year, source: docsByType["financial_statement"]?.length ? "Document" : "Pending" },
                { label: "Stock Declaration", filled: (camData?.stock_details?.length ?? 0) > 0, source: docsByType["stock_declaration"]?.length ? "Document" : "Pending" },
                { label: "ITR / Tax", filled: !!camData?.output?.itr_income_previous_year, source: docsByType["itr"]?.length ? "Document" : "Pending" },
                { label: "Scorecard", filled: !!camData?.scorecard?.total_score, source: "API" },
              ].map((item) => (
                <div key={item.label} className="flex items-center justify-between py-1">
                  <div className="flex items-center gap-2">
                    {item.filled ? <CheckCircle2 size={12} className="text-green-500" /> : <div className="w-3 h-3 rounded-full border-2 border-gray-200" />}
                    <span className="text-xs text-gray-700">{item.label}</span>
                  </div>
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                    item.source === "API" ? "bg-blue-50 text-blue-600" :
                    item.source === "Document" ? "bg-green-50 text-green-600" :
                    "bg-gray-50 text-gray-400"
                  }`}>{item.source}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Legend */}
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
            <p className="text-xs font-semibold text-gray-600 mb-2">Field Colors in CAM</p>
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded bg-gray-100 border border-gray-300" />
                <span className="text-[10px] text-gray-600">Grey — Auto-populated from APIs (read-only)</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded bg-yellow-100 border border-yellow-300" />
                <span className="text-[10px] text-gray-600">Yellow — Editable, filled from documents or manually</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
