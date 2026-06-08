import { useState, useRef, useEffect } from "react";
import { Pencil, Check, X, Loader2 } from "lucide-react";

interface EditableFieldProps {
  value: any;
  fieldKey: string;
  type?: "text" | "number" | "textarea" | "select";
  options?: string[];
  onSave: (key: string, value: any) => Promise<void>;
  label?: string;
  format?: (v: any) => string;
  className?: string;
  readonly?: boolean;
}

export default function EditableField({
  value,
  fieldKey,
  type = "text",
  options,
  onSave,
  label,
  format,
  className = "",
  readonly = false,
}: EditableFieldProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<any>(value);
  const [saving, setSaving] = useState(false);
  const [modified, setModified] = useState(false);
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(null);

  useEffect(() => {
    if (editing && inputRef.current) inputRef.current.focus();
  }, [editing]);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  if (readonly) {
    return (
      <div className={`group relative ${className}`} title="Auto-populated from source data">
        {label && <span className="text-xs text-gray-400 block mb-0.5">{label}</span>}
        <span className="text-sm text-gray-900 font-medium">{format ? format(value) : String(value ?? "—")}</span>
      </div>
    );
  }

  const displayValue = format ? format(value) : String(value ?? "—");

  const handleSave = async () => {
    setSaving(true);
    try {
      const finalVal = type === "number" ? Number(draft) : draft;
      await onSave(fieldKey, finalVal);
      setModified(true);
      setEditing(false);
    } catch {
      // keep editing open on error
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setDraft(value);
    setEditing(false);
  };

  if (editing) {
    return (
      <div className={`relative ${className}`}>
        {label && <span className="text-xs text-yellow-700 block mb-0.5">{label}</span>}
        <div className="flex items-center gap-1.5">
          {type === "textarea" ? (
            <textarea
              ref={inputRef as React.RefObject<HTMLTextAreaElement>}
              value={draft ?? ""}
              onChange={(e) => setDraft(e.target.value)}
              className="w-full rounded-md border border-yellow-400 bg-yellow-50 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400 resize-y min-h-[60px]"
              onKeyDown={(e) => { if (e.key === "Escape") handleCancel(); }}
            />
          ) : type === "select" && options ? (
            <select
              ref={inputRef as React.RefObject<HTMLSelectElement>}
              value={draft ?? ""}
              onChange={(e) => setDraft(e.target.value)}
              className="w-full rounded-md border border-yellow-400 bg-yellow-50 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400"
            >
              {options.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          ) : (
            <input
              ref={inputRef as React.RefObject<HTMLInputElement>}
              type={type}
              value={draft ?? ""}
              onChange={(e) => setDraft(e.target.value)}
              className="w-full rounded-md border border-yellow-400 bg-yellow-50 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-400"
              onKeyDown={(e) => { if (e.key === "Enter") handleSave(); if (e.key === "Escape") handleCancel(); }}
            />
          )}
          <button onClick={handleSave} disabled={saving} className="p-1 rounded hover:bg-green-100 text-green-600">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
          </button>
          <button onClick={handleCancel} className="p-1 rounded hover:bg-red-100 text-red-500">
            <X size={14} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`group relative cursor-pointer rounded-md bg-yellow-50 border border-yellow-200 px-2.5 py-1.5 hover:border-yellow-400 transition ${className}`}
      onClick={() => setEditing(true)}
    >
      {label && <span className="text-xs text-yellow-700 block mb-0.5">{label}</span>}
      <div className="flex items-center gap-1.5">
        {modified && <span className="w-1.5 h-1.5 rounded-full bg-blue-500 flex-shrink-0" title="Modified" />}
        <span className="text-sm text-gray-900 font-medium flex-1">{displayValue}</span>
        <Pencil size={12} className="text-yellow-500 opacity-0 group-hover:opacity-100 transition flex-shrink-0" />
      </div>
    </div>
  );
}
