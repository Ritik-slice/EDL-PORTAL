import { useState } from "react";
import { useDropzone } from "react-dropzone";
import { Upload, CheckCircle, XCircle, Loader, FileText } from "lucide-react";
import api from "../../utils/api";
import { Document, DocumentType } from "../../types";

const DOC_TYPES: { value: DocumentType; label: string }[] = [
  { value: "bank_statement", label: "Bank Statement" },
  { value: "gst_return", label: "GST Return (GSTR-3B/1)" },
  { value: "financial_statement", label: "Financial Statement (P&L + BS)" },
  { value: "bureau_report", label: "Credit Bureau Report" },
  { value: "itr", label: "ITR / Form 26AS" },
  { value: "kyc", label: "KYC Documents" },
  { value: "other", label: "Other" },
];

const statusIcon = {
  pending: <Loader size={14} className="animate-spin text-gray-400" />,
  processing: <Loader size={14} className="animate-spin text-blue-500" />,
  completed: <CheckCircle size={14} className="text-green-500" />,
  failed: <XCircle size={14} className="text-red-500" />,
};

interface Props {
  caseId: string;
  documents: Document[];
  onUploaded: () => void;
}

export default function DocumentUpload({ caseId, documents, onUploaded }: Props) {
  const [docType, setDocType] = useState<DocumentType>("bank_statement");
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    multiple: false,
    accept: {
      "application/pdf": [".pdf"],
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
      "application/vnd.ms-excel": [".xls"],
      "text/csv": [".csv"],
      "application/json": [".json"],
    },
    onDrop: async (files) => {
      if (!files[0]) return;
      setUploading(true);
      setUploadError("");
      const fd = new FormData();
      fd.append("file", files[0]);
      fd.append("doc_type", docType);
      try {
        await api.post(`/cases/${caseId}/documents`, fd, {
          headers: { "Content-Type": "multipart/form-data" },
        });
        onUploaded();
      } catch (err: unknown) {
        const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
        setUploadError(msg || "Upload failed");
      } finally {
        setUploading(false);
      }
    },
  });

  return (
    <div className="space-y-6">
      <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm">
        <h3 className="font-bold text-gray-900 mb-4">Upload Document</h3>

        <div className="mb-4">
          <label className="block text-xs font-semibold text-gray-600 mb-2">Document Type</label>
          <div className="flex flex-wrap gap-2">
            {DOC_TYPES.map((dt) => (
              <button
                key={dt.value}
                onClick={() => setDocType(dt.value)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${
                  docType === dt.value
                    ? "bg-blue-600 text-white border-blue-600"
                    : "bg-white text-gray-600 border-gray-200 hover:border-blue-300"
                }`}
              >
                {dt.label}
              </button>
            ))}
          </div>
        </div>

        <div
          {...getRootProps()}
          className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition ${
            isDragActive ? "border-blue-500 bg-blue-50" : "border-gray-200 hover:border-blue-300 hover:bg-gray-50"
          } ${uploading ? "opacity-50 pointer-events-none" : ""}`}
        >
          <input {...getInputProps()} />
          <Upload size={32} className="mx-auto mb-3 text-gray-300" />
          {uploading ? (
            <p className="text-blue-600 font-semibold">Uploading & parsing...</p>
          ) : isDragActive ? (
            <p className="text-blue-600 font-semibold">Drop the file here</p>
          ) : (
            <>
              <p className="text-gray-600 font-semibold">Drag & drop or click to upload</p>
              <p className="text-gray-400 text-xs mt-1">PDF, Excel, CSV, JSON supported</p>
            </>
          )}
        </div>

        {uploadError && (
          <p className="mt-3 text-red-600 text-sm bg-red-50 px-4 py-2 rounded-lg">{uploadError}</p>
        )}
      </div>

      {/* Existing documents */}
      <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm">
        <h3 className="font-bold text-gray-900 mb-4">Uploaded Documents</h3>
        {documents.length === 0 ? (
          <p className="text-gray-400 text-sm">No documents uploaded yet.</p>
        ) : (
          <div className="space-y-3">
            {documents.map((doc) => (
              <div key={doc.id} className="flex items-center gap-4 px-4 py-3 border border-gray-100 rounded-xl bg-gray-50">
                <FileText size={16} className="text-gray-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm text-gray-900 truncate">{doc.filename}</p>
                  <p className="text-xs text-gray-400 capitalize">{doc.doc_type.replace("_", " ")}</p>
                </div>
                <div className="flex items-center gap-2">
                  {statusIcon[doc.parse_status]}
                  <span className="text-xs text-gray-500 capitalize">{doc.parse_status}</span>
                </div>
                {doc.extraction_confidence !== undefined && (
                  <span className="text-xs text-gray-400">
                    {(doc.extraction_confidence * 100).toFixed(0)}% confidence
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
