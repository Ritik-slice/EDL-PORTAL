import { BrowserRouter, Routes, Route, Navigate, Link, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LayoutDashboard, LogOut } from "lucide-react";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import CaseDetail from "./pages/CaseDetail";
import CAMDetail from "./pages/CAMDetail";
import { useAuth } from "./store/auth";

const qc = new QueryClient();

function Layout({ children }: { children: React.ReactNode }) {
  const { logout } = useAuth();
  const loc = useLocation();

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <nav className="bg-white border-b border-gray-100 px-8 py-3 flex items-center justify-between shadow-sm">
        <Link to="/" className="text-xl font-extrabold text-gray-900">
          EDL<span className="text-blue-600"> - SLICE</span>
          <span className="text-xs font-normal text-gray-400 ml-2">CAM Automation Platform</span>
        </Link>
        <div className="flex items-center gap-4">
          <Link to="/" className={`flex items-center gap-1.5 text-sm font-medium transition ${loc.pathname === "/" ? "text-blue-600" : "text-gray-500 hover:text-gray-800"}`}>
            <LayoutDashboard size={14} /> Dashboard
          </Link>
          <button onClick={logout} className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-gray-700 transition">
            <LogOut size={14} /> Sign out
          </button>
        </div>
      </nav>
      <main className="flex-1">{children}</main>
    </div>
  );
}

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { token } = useAuth();
  return token ? <>{children}</> : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <QueryClientProvider client={qc}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={
            <PrivateRoute>
              <Layout><Dashboard /></Layout>
            </PrivateRoute>
          } />
          <Route path="/cases/:id" element={
            <PrivateRoute>
              <Layout><CaseDetail /></Layout>
            </PrivateRoute>
          } />
          <Route path="/cases/:id/cam-detail" element={
            <PrivateRoute>
              <Layout><CAMDetail /></Layout>
            </PrivateRoute>
          } />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
