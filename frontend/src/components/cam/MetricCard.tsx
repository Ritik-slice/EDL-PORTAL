import { LucideIcon } from "lucide-react";

interface MetricCardProps {
  label: string;
  value: string | number;
  subtitle?: string;
  icon?: LucideIcon;
  trend?: "up" | "down" | "neutral";
  color?: "blue" | "green" | "red" | "yellow" | "gray";
  className?: string;
}

const colorMap = {
  blue: "bg-blue-50 border-blue-200 text-blue-700",
  green: "bg-green-50 border-green-200 text-green-700",
  red: "bg-red-50 border-red-200 text-red-700",
  yellow: "bg-yellow-50 border-yellow-200 text-yellow-700",
  gray: "bg-gray-50 border-gray-200 text-gray-700",
};

const iconBg = {
  blue: "bg-blue-100 text-blue-600",
  green: "bg-green-100 text-green-600",
  red: "bg-red-100 text-red-600",
  yellow: "bg-yellow-100 text-yellow-600",
  gray: "bg-gray-100 text-gray-600",
};

export default function MetricCard({ label, value, subtitle, icon: Icon, trend, color = "gray", className = "" }: MetricCardProps) {
  return (
    <div className={`rounded-xl border p-4 ${colorMap[color]} ${className}`}>
      <div className="flex items-start justify-between">
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide opacity-70 truncate">{label}</p>
          <p className="text-xl font-bold mt-1 truncate">{value}</p>
          {subtitle && <p className="text-xs mt-0.5 opacity-60">{subtitle}</p>}
        </div>
        {Icon && (
          <div className={`p-2 rounded-lg ${iconBg[color]} flex-shrink-0 ml-2`}>
            <Icon size={18} />
          </div>
        )}
      </div>
      {trend && (
        <div className={`text-xs mt-2 font-medium ${trend === "up" ? "text-green-600" : trend === "down" ? "text-red-600" : "text-gray-500"}`}>
          {trend === "up" ? "▲" : trend === "down" ? "▼" : "–"} {trend}
        </div>
      )}
    </div>
  );
}
