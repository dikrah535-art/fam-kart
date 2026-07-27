import { NavLink, useNavigate } from "react-router-dom";
import type { ReactNode } from "react";
import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Home,
  ShoppingCart,
  Package,
  Scroll,
  Wallet,
  BookOpen,
  CheckSquare,
  Settings,
  LogOut,
  MoreHorizontal,
  X,
} from "lucide-react";
import Logo from "@/components/Logo";
import QuickAddFab from "@/components/QuickAddFab";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

const nav = [
  { to: "/dashboard", label: "Dashboard", icon: Home },
  { to: "/shopping", label: "Shopping", icon: ShoppingCart },
  { to: "/categories", label: "Categories", icon: Package },
  { to: "/history", label: "History", icon: Scroll },
  { to: "/budget", label: "Budget", icon: Wallet },
  { to: "/todo", label: "To-Do", icon: CheckSquare },
  { to: "/notebook", label: "Notebook", icon: BookOpen },
  { to: "/settings", label: "Settings", icon: Settings },
];

export default function AppLayout({ children }: { children: ReactNode }) {
  const { profile, signOut, user } = useAuth();
  const navigate = useNavigate();
  const [moreOpen, setMoreOpen] = useState(false);

  const handleSignOut = async () => {
    await signOut();
    toast.success("Signed out");
    navigate("/login");
  };

  const firstName = profile?.full_name?.split(" ")[0] ?? user?.email?.split("@")[0] ?? "You";

  // Bottom bar only has room for a few icons on mobile — everything else
  // (To-Do, Notebook, Settings, etc.) used to just be silently unreachable.
  // Now it lives behind "More" instead of being cut off.
  const primaryPaths = ["/dashboard", "/shopping", "/todo", "/budget"];
  const primaryMobileNav = primaryPaths
    .map((p) => nav.find((n) => n.to === p))
    .filter(Boolean) as typeof nav;
  const overflowMobileNav = nav.filter((n) => !primaryPaths.includes(n.to));

  return (
    <div className="min-h-screen bg-background dot-grid">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex fixed top-0 left-0 bottom-0 w-64 flex-col border-r border-border bg-sidebar z-40">
        <div className="p-5 border-b border-border">
          <Logo size={22} />
        </div>
        <nav className="flex-1 py-4 overflow-y-auto">
          {nav.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `group flex items-center gap-3 px-5 py-2.5 text-sm transition-all border-l-2 ${
                  isActive
                    ? "border-primary text-primary bg-primary/5"
                    : "border-transparent text-muted-foreground hover:text-white hover:border-primary/50 hover:translate-x-1"
                }`
              }
            >
              <Icon size={18} />
              <span className="font-medium">{label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="p-4 border-t border-border space-y-3">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-full bg-primary/20 text-primary flex items-center justify-center font-semibold">
              {firstName[0]?.toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">{firstName}</p>
              <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
            </div>
            <button
              onClick={handleSignOut}
              className="text-muted-foreground hover:text-destructive transition"
              title="Sign out"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile "More" overflow sheet */}
      <AnimatePresence>
        {moreOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="lg:hidden fixed inset-0 bg-black/60 z-40"
              onClick={() => setMoreOpen(false)}
            />
            <motion.div
              initial={{ y: "100%" }}
              animate={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 28, stiffness: 300 }}
              className="lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-sidebar border-t border-border rounded-t-2xl p-4 pb-24"
            >
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-semibold text-white">More</span>
                <button onClick={() => setMoreOpen(false)} className="text-muted-foreground">
                  <X size={18} />
                </button>
              </div>
              <div className="grid grid-cols-4 gap-3">
                {overflowMobileNav.map(({ to, label, icon: Icon }) => (
                  <NavLink
                    key={to}
                    to={to}
                    onClick={() => setMoreOpen(false)}
                    className={({ isActive }) =>
                      `flex flex-col items-center gap-1.5 py-3 rounded-lg text-xs ${
                        isActive ? "text-primary bg-primary/10" : "text-muted-foreground"
                      }`
                    }
                  >
                    <Icon size={20} />
                    <span>{label}</span>
                  </NavLink>
                ))}
                <button
                  onClick={() => { setMoreOpen(false); handleSignOut(); }}
                  className="flex flex-col items-center gap-1.5 py-3 rounded-lg text-xs text-muted-foreground hover:text-destructive"
                >
                  <LogOut size={20} />
                  <span>Sign out</span>
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Mobile bottom nav */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-sidebar flex justify-around py-2">
        {primaryMobileNav.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex flex-col items-center gap-0.5 px-3 py-1.5 text-xs ${
                isActive ? "text-primary" : "text-muted-foreground"
              }`
            }
          >
            <Icon size={20} />
            <span>{label}</span>
          </NavLink>
        ))}
        <button
          onClick={() => setMoreOpen(true)}
          className="flex flex-col items-center gap-0.5 px-3 py-1.5 text-xs text-muted-foreground"
        >
          <MoreHorizontal size={20} />
          <span>More</span>
        </button>
      </nav>

      <main className="lg:ml-64 min-h-screen pb-20 lg:pb-0">{children}</main>
      <QuickAddFab />
    </div>
  );
}
