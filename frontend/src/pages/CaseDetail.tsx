import { useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useDropzone } from "react-dropzone";
import { ArrowLeft, Upload, Zap, FileText, AlertTriangle, CheckCircle2, XCircle, Eye, Loader } from "lucide-react";
import api, { formatCrore, severityColor, gradeColor } from "../utils/api";
import { Case, Document } from "../types";

export default function CaseDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [uploadError, setUploadError] = useState("");

  const { data: caseData, refetch: refetchCase } = useQuery<Case>({
    queryKey: ["case", id],
    queryFn: () => api.get(`/cases/${id}`).then((r) => r.data),
  });

  const { data: documents = [], refetch: refetchDocs } = useQuery<Document[]>({
    queryKey: ["docs", id],
    queryFn: () => api.get(`/cases/${id}/documents`).then((r) => r.data),
  });

  // Check if CAM data exists
  const { data: camData } = useQuery({
    queryKey: ["cam-data", id],
    queryFn: () => api.get(`/cases/${id}/cam-data`).then((r) => r.data).catch(() => null),
    retry: false,
  });

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData();
      fd.append("file", file);
      return api.post(`/cases/${id}/upload-cam`, fd, {
        headers: { "Content-Type": "multipart/form-data" },
        timeout: 120000,
      }).then((r) => r.data);
    },
    onSuccess: () => {
      setUploadError("");
      qc.invalidateQueries({ queryKey: ["case", id] });
      qc.invalidateQueries({ queryKey: ["docs", id] });
      qc.invalidateQueries({ queryKey: ["cam-data", id] });
      refetchCase();
      refetchDocs();
      // Navigate to CAM detail after successful upload
      setTimeout(() => navigate(`/cases/${id}/cam-detail`), 500);
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setUploadError(msg || "Upload failed. Please try again.");
    },
  });

  const onDrop = useCallback((files: File[]) => {
    if (files[0]) {
      setUploadError("");
      uploadMutation.mutate(files[0]);
    }
  }, [uploadMutation]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    multiple: false,
    accept: {
      "application/vnd.ms-excel.sheet.macroEnabled.12": [".xlsm"],
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
    },
  });

  if (!caseData) return <div className="p-8 text-gray-400">Loading...</div>;

  const signals = caseData.risk_signals;
  const hasCamData = !!camData;

  return (
    <div className="p-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-start gap-4 mb-8">
        <button onClick={() => navigate("/")} className="mt-1 text-gray-400 hover:text-gray-700 transition">
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">{caseData.borrower_name}</h1>
            {signals?.risk_grade && (
              <span className={`font-bold px-3 py-1 rounded-lg text-sm ${gradeColor(signals.risk_grade)}`}>
                Grade {signals.risk_grade}
              </span>
            )}
            {signals?.score_risk_band && (
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-yellow-100 text-yellow-700">
                {signals.score_risk_band}
              </span>
            )}
          </div>
          <p className="text-gray-500 text-sm mt-1">
            {caseData.case_ref} · {formatCrore(caseData.loan_amount_requested)} · {caseData.loan_type?.replace("_", " ")}
          </p>
        </div>

        {hasCamData && (
          <button
            onClick={() => navigate(`/cases/${id}/cam-detail`)}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-xl font-semibold text-sm transition"
          >
            <Eye size={15} /> View Full CAM
          </button>
        )}
      </div>

      {/* Key Metrics (if CAM data exists) */}
      {signals && (
        <div className="grid grid-cols-4 gap-4 mb-8">
          {[
            { label: "Bureau Score", value: signals.bureau_score ?? "—", ok: (signals.bureau_score ?? 0) >= 700 },
            { label: "Total Score", value: signals.total_score ?? "—", ok: (signals.total_score ?? 0) >= 65 },
            { label: "Final Loan", value: signals.final_loan_amount ? formatCrore(signals.final_loan_amount) : "—" },
            { label: "FOIR", value: signals.final_foir ? `${(signals.final_foir * 100).toFixed(1)}%` : "—", ok: (signals.final_foir ?? 1) <= 0.6 },
          ].map(({ label, value, ok }) => (
            <div key={label} className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
              <p className="text-xs text-gray-500 font-medium uppercase tracking-wide mb-1">{label}</p>
              <div className="flex items-center gap-2">
                <span className="text-xl font-bold text-gray-900">{value}</span>
                {value !== "—" && ok !== undefined && (ok
                  ? <CheckCircle2 size={16} className="text-green-500" />
                  : <XCircle size={16} className="text-red-500" />
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Upload CAM XLSM */}
      <div className="bg-white border border-gray-100 rounded-2xl p-8 shadow-sm mb-6">
        <h3 className="font-bold text-gray-900 mb-2 flex items-center gap-2">
          <Upload size={18} className="text-blue-600" />
          Upload CAM Excel File
        </h3>
        <p className="text-gray-500 text-sm mb-5">
          Upload the .xlsm CAM file from the lending platform. All sheets will be parsed automatically and data will be available in the CAM view.
        </p>

        <div
          {...getRootProps()}
          className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition ${
            isDragActive ? "border-blue-500 bg-blue-50" : "border-gray-200 hover:border-blue-300 hover:bg-gray-50"
          } ${uploadMutation.isPending ? "opacity-50 pointer-events-none" : ""}`}
        >
          <input {...getInputProps()} />
          {uploadMutation.isPending ? (
            <div className="flex flex-col items-center gap-3">
              <Loader size={36} className="text-blue-500 animate-spin" />
              <p className="text-blue-600 font-semibold">Parsing CAM file... This may take a few seconds</p>
              <p className="text-gray-400 text-xs">Extracting data from all sheets, detecting editable fields</p>
            </div>
          ) : isDragActive ? (
            <p className="text-blue-600 font-semibold text-lg">Drop the CAM file here</p>
          ) : (
            <>
              <Upload size={36} className="mx-auto mb-3 text-gray-300" />
              <p className="text-gray-600 font-semibold">Drag & drop CAM .xlsm file or click to browse</p>
              <p className="text-gray-400 text-xs mt-1">.xlsm and .xlsx files supported (max ~10MB)</p>
            </>
          )}
        </div>

        {uploadError && (
          <div className="mt-4 px-5 py-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm flex items-center gap-2">
            <XCircle size={16} /> {uploadError}
          </div>
        )}

        {uploadMutation.isSuccess && (
          <div className="mt-4 px-5 py-3 bg-green-50 border border-green-200 text-green-700 rounded-xl text-sm flex items-center gap-2">
            <CheckCircle2 size={16} /> CAM parsed successfully! Redirecting to full CAM view...
          </div>
        )}
      </div>

      {/* Uploaded Documents */}
      {documents.length > 0 && (
        <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm">
          <h3 className="font-bold text-gray-900 mb-4">Uploaded Documents</h3>
          <div className="space-y-2">
            {documents.map((doc) => (
              <div key={doc.id} className="flex items-center gap-4 px-4 py-3 border border-gray-100 rounded-xl bg-gray-50">
                <FileText size={16} className="text-gray-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm text-gray-900 truncate">{doc.filename}</p>
                  <p className="text-xs text-gray-400 capitalize">{doc.doc_type?.replace("_", " ")}</p>
                </div>
                <div className="flex items-center gap-2">
                  {doc.parse_status === "completed" ? (
                    <CheckCircle2 size={14} className="text-green-500" />
                  ) : doc.parse_status === "failed" ? (
                    <XCircle size={14} className="text-red-500" />
                  ) : (
                    <Loader size={14} className="text-blue-500 animate-spin" />
                  )}
                  <span className="text-xs text-gray-500 capitalize">{doc.parse_status}</span>
                </div>
                {doc.extraction_confidence !== undefined && doc.extraction_confidence !== null && (
                  <span className="text-xs text-gray-400">{(doc.extraction_confidence * 100).toFixed(0)}%</span>
                )}
              </div>
            ))}
          </div>

          {hasCamData && (
            <button
              onClick={() => navigate(`/cases/${id}/cam-detail`)}
              className="mt-4 w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-xl font-semibold text-sm transition"
            >
              <Eye size={16} /> Open Full CAM Report
            </button>
          )}
        </div>
      )}
    </div>
  );
}
