import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import Logo from "@/components/Logo";
import PageTransition from "@/components/PageTransition";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/lib/supabase";

function passwordStrength(pw: string) {
  let score = 0;
  if (pw.length >= 8) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  if (pw.length >= 12) score++;
  if (!pw) return { label: "", color: "", pct: 0 };
  if (score <= 1) return { label: "Weak", color: "#ef4444", pct: 25 };
  if (score === 2) return { label: "Fair", color: "#f59e0b", pct: 50 };
  if (score === 3) return { label: "Good", color: "#eab308", pct: 75 };
  return { label: "Strong", color: "#3ecf8e", pct: 100 };
}

export default function ResetPassword() {
  const navigate = useNavigate();
  const [pw, setPw] = useState("");
  const [cf, setCf] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const s = useMemo(() => passwordStrength(pw), [pw]);
  const mismatch = cf && pw !== cf;

  const handle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mismatch) return toast.error("Passwords do not match");
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password: pw });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("Password updated!");
    setTimeout(() => navigate("/login"), 2000);
  };

  return (
    <PageTransition>
      <div className="hero-gradient dot-grid min-h-screen flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          <div className="flex justify-center mb-8"><Logo size={28} /></div>
          <div className="rounded-xl border border-border bg-card p-8">
            <h1 className="text-2xl font-bold text-white">Set a new password</h1>
            <form onSubmit={handle} className="mt-6 space-y-4">
              <div>
                <Label htmlFor="pw">New password</Label>
                <div className="relative mt-1.5">
                  <Input id="pw" type={showPw ? "text" : "password"} required value={pw} onChange={(e) => setPw(e.target.value)} className="pr-10" />
                  <button type="button" onClick={() => setShowPw((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                    {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                {pw && (
                  <div className="mt-2">
                    <div className="h-1 rounded-full bg-muted overflow-hidden">
                      <div className="h-full transition-all" style={{ width: `${s.pct}%`, background: s.color }} />
                    </div>
                    <p className="text-xs mt-1" style={{ color: s.color }}>{s.label}</p>
                  </div>
                )}
              </div>
              <div>
                <Label htmlFor="cf">Confirm password</Label>
                <Input id="cf" type={showPw ? "text" : "password"} required value={cf} onChange={(e) => setCf(e.target.value)} className="mt-1.5" />
                {mismatch && <p className="text-xs text-destructive mt-1">Passwords don't match</p>}
              </div>
              <Button type="submit" disabled={loading || !!mismatch} className="w-full h-11 bg-primary text-primary-foreground hover:bg-primary/90">
                {loading ? "Updating..." : "Update password"}
              </Button>
            </form>
          </div>
        </div>
      </div>
    </PageTransition>
  );
}
