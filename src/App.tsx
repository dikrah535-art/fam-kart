import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AnimatePresence } from "framer-motion";
import { useAuth } from "@/contexts/AuthContext";
import Landing from "@/pages/Landing";
import Login from "@/pages/Login";
import Signup from "@/pages/Signup";
import ForgotPassword from "@/pages/ForgotPassword";
import ResetPassword from "@/pages/ResetPassword";
import AuthCallback from "@/pages/AuthCallback";
import Onboarding from "@/pages/Onboarding";
import Dashboard from "@/pages/Dashboard";
import Shopping from "@/pages/Shopping";
import Notebook from "@/pages/Notebook";
import Todo from "@/pages/Todo";
import History from "@/pages/History";
import Budget from "@/pages/Budget";
import Categories from "@/pages/Categories";
import Settings from "@/pages/Settings";
import NotFound from "@/pages/NotFound";
import AppLayout from "@/components/AppLayout";

function Protected({ children }: { children: React.ReactNode }) {
  const { session, profile, loading } = useAuth();
  const location = useLocation();
  if (loading) return <FullScreenLoader />;
  if (!session) return <Navigate to="/login" replace state={{ from: location }} />;
  if (!profile?.family_id) return <Navigate to="/onboarding" replace />;
  return <AppLayout>{children}</AppLayout>;
}

function FullScreenLoader() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
    </div>
  );
}

export default function App() {
  const location = useLocation();
  return (
    <AnimatePresence mode="wait">
      <Routes location={location} key={location.pathname}>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="/onboarding" element={<Onboarding />} />
        <Route path="/dashboard" element={<Protected><Dashboard /></Protected>} />
        <Route path="/shopping" element={<Protected><Shopping /></Protected>} />
        <Route path="/notebook" element={<Protected><Notebook /></Protected>} />
        <Route path="/todo" element={<Protected><Todo /></Protected>} />
        <Route path="/to-do" element={<Protected><Todo /></Protected>} />
        <Route path="/history" element={<Protected><History /></Protected>} />
        <Route path="/budget" element={<Protected><Budget /></Protected>} />
        <Route path="/categories" element={<Protected><Categories /></Protected>} />
        <Route path="/settings" element={<Protected><Settings /></Protected>} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </AnimatePresence>
  );
}
