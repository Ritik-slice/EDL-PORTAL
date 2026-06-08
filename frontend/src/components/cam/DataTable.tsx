import { useState } from "react";
import { Pencil, Check, X, Loader2 } from "lucide-react";

export interface Column<T = any> {
  key: string;
  header: string;
  render?: (row: T, rowIdx: number) => React.ReactNode;
  editable?: boolean;
  type?: "text" | "number" | "select";
  options?: string[];
  align?: "left" | "right" | "center";
  width?: string;
  format?: (v: any) => string;
}

interface DataTableProps<T = any> {
  columns: Column<T>[];
  data: T[];
  onCellSave?: (rowIdx: number, key: string, value: any) => Promise<void>;
  compact?: boolean;
  className?: string;
  emptyMessage?: string;
  stickyHeader?: boolean;
  footer?: React.ReactNode;
}

interface EditingCell {
  row: number;
  key: string;
  value: any;
}

export default function DataTable<T extends Record<string, any>>({
  columns,
  data,
  onCellSave,
  compact = false,
  className = "",
  emptyMessage = "No data available",
  stickyHeader = false,
  footer,
}: DataTableProps<T>) {
  const [editingCell, setEditingCell] = useState<EditingCell | null>(null);
  const [saving, setSaving] = useState(false);
  const [modifiedCells, setModifiedCells] = useState<Set<string>>(new Set());

  const py = compact ? "py-1.5" : "py-2.5";
  const textSize = compact ? "text-xs" : "text-sm";

  const handleSave = async () => {
    if (!editingCell || !onCellSave) return;
    setSaving(true);
    try {
      const val = columns.find(c => c.key === editingCell.key)?.type === "number"
        ? Number(editingCell.value) : editingCell.value;
      await onCellSave(editingCell.row, editingCell.key, val);
      setModifiedCells(prev => new Set(prev).add(`${editingCell.row}-${editingCell.key}`));
      setEditingCell(null);
    } finally {
      setSaving(false);
    }
  };

  if (data.length === 0) {
    return <div className={`text-center text-gray-400 text-sm py-8 ${className}`}>{emptyMessage}</div>;
  }

  return (
    <div className={`overflow-x-auto ${className}`}>
      <table className="w-full">
        <thead>
          <tr className={`bg-gray-50 border-b border-gray-200 ${stickyHeader ? "sticky top-0 z-10" : ""}`}>
            {columns.map((col) => (
              <th
                key={col.key}
                className={`${py} px-3 text-xs font-semibold text-gray-500 uppercase tracking-wider ${
                  col.align === "right" ? "text-right" : col.align === "center" ? "text-center" : "text-left"
                }`}
                style={col.width ? { width: col.width } : undefined}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, rowIdx) => (
            <tr key={rowIdx} className="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
              {columns.map((col) => {
                const isEditing = editingCell?.row === rowIdx && editingCell?.key === col.key;
                const isModified = modifiedCells.has(`${rowIdx}-${col.key}`);
                const cellValue = row[col.key];
                const align = col.align === "right" ? "text-right" : col.align === "center" ? "text-center" : "text-left";

                if (col.render && !isEditing) {
                  return (
                    <td key={col.key} className={`${py} px-3 ${textSize} ${align}`}>
                      {col.render(row, rowIdx)}
                    </td>
                  );
                }

                if (isEditing) {
                  return (
                    <td key={col.key} className={`${py} px-1.5`}>
                      <div className="flex items-center gap-1">
                        {col.type === "select" && col.options ? (
                          <select
                            value={editingCell.value}
                            onChange={(e) => setEditingCell({ ...editingCell, value: e.target.value })}
                            className="w-full rounded border border-yellow-400 bg-yellow-50 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-yellow-400"
                            autoFocus
                          >
                            {col.options.map(o => <option key={o} value={o}>{o}</option>)}
                          </select>
                        ) : (
                          <input
                            type={col.type || "text"}
                            value={editingCell.value ?? ""}
                            onChange={(e) => setEditingCell({ ...editingCell, value: e.target.value })}
                            className="w-full rounded border border-yellow-400 bg-yellow-50 px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-yellow-400"
                            autoFocus
                            onKeyDown={(e) => { if (e.key === "Enter") handleSave(); if (e.key === "Escape") setEditingCell(null); }}
                          />
                        )}
                        <button onClick={handleSave} disabled={saving} className="p-0.5 text-green-600 hover:bg-green-50 rounded">
                          {saving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                        </button>
                        <button onClick={() => setEditingCell(null)} className="p-0.5 text-red-500 hover:bg-red-50 rounded">
                          <X size={12} />
                        </button>
                      </div>
                    </td>
                  );
                }

                if (col.editable && onCellSave) {
                  return (
                    <td
                      key={col.key}
                      className={`${py} px-3 ${textSize} ${align} cursor-pointer group`}
                      onClick={() => setEditingCell({ row: rowIdx, key: col.key, value: cellValue })}
                    >
                      <span className="inline-flex items-center gap-1 rounded bg-yellow-50 border border-yellow-200 px-2 py-0.5 hover:border-yellow-400 transition">
                        {isModified && <span className="w-1.5 h-1.5 rounded-full bg-blue-500 flex-shrink-0" />}
                        <span className="font-mono">{col.format ? col.format(cellValue) : String(cellValue ?? "—")}</span>
                        <Pencil size={10} className="text-yellow-500 opacity-0 group-hover:opacity-100 transition" />
                      </span>
                    </td>
                  );
                }

                return (
                  <td key={col.key} className={`${py} px-3 ${textSize} font-mono text-gray-900 ${align}`}>
                    {col.format ? col.format(cellValue) : String(cellValue ?? "—")}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
        {footer && <tfoot>{footer}</tfoot>}
      </table>
    </div>
  );
}
