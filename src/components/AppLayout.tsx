import { NavLink, useNavigate } from "react-router-dom";
import type { ReactNode } from "react";
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

  const handleSignOut = async () => {
    await signOut();
    toast.success("Signed out");
    navigate("/login");
  };

  const firstName = profile?.full_name?.split(" ")[0] ?? user?.email?.split("@")[0] ?? "You";

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

      {/* Mobile bottom nav */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-sidebar flex justify-around py-2">
        {nav.slice(0, 5).map(({ to, icon: Icon, label }) => (
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
      </nav>

      <main className="lg:ml-64 min-h-screen pb-20 lg:pb-0">{children}</main>
      <QuickAddFab />
    </div>
  );
}
