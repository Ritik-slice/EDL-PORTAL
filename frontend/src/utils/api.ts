import axios from "axios";

const api = axios.create({ baseURL: "http://localhost:8000/api/v1" });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("access_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem("access_token");
      window.location.href = "/login";
    }
    return Promise.reject(err);
  }
);

export default api;

export const formatCrore = (amount: number): string => {
  if (amount >= 1e7) return `₹${(amount / 1e7).toFixed(2)} Cr`;
  if (amount >= 1e5) return `₹${(amount / 1e5).toFixed(2)} L`;
  return `₹${amount.toLocaleString("en-IN")}`;
};

export const severityColor = (severity: string) => {
  return {
    critical: "text-red-700 bg-red-50 border-red-200",
    high: "text-orange-700 bg-orange-50 border-orange-200",
    medium: "text-yellow-700 bg-yellow-50 border-yellow-200",
    low: "text-blue-700 bg-blue-50 border-blue-200",
  }[severity] ?? "text-gray-700 bg-gray-50 border-gray-200";
};

export const gradeColor = (grade: string) => {
  return { A: "text-green-700 bg-green-100", B: "text-blue-700 bg-blue-100",
           C: "text-yellow-700 bg-yellow-100", D: "text-red-700 bg-red-100" }[grade] ?? "";
};
