import { useState, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
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

export default function Signup() {
  const navigate = useNavigate();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [showCf, setShowCf] = useState(false);
  const [loading, setLoading] = useState(false);

  const strength = useMemo(() => passwordStrength(password), [password]);
  const mismatch = confirm && password !== confirm;

  const handleGoogle = async () => {
    setLoading(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: window.location.origin + "/auth/callback",
        queryParams: { access_type: "offline", prompt: "select_account" },
      },
    });
    if (error) {
      toast.error(error.message);
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mismatch) return toast.error("Passwords do not match");
    setLoading(true);
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
        emailRedirectTo: window.location.origin + "/auth/callback",
      },
    });
    if (error) {
      setLoading(false);
      return toast.error(error.message);
    }
    if (data.user) {
      // Upsert profile row (in case trigger doesn't handle it).
      await supabase.from("profiles").upsert({
        id: data.user.id,
        full_name: fullName,
        email,
      });
    }
    setLoading(false);
    toast.success("Account created!");
    navigate("/onboarding");
  };

  return (
    <PageTransition>
      <div className="hero-gradient dot-grid min-h-screen flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          <div className="flex justify-center mb-8">
            <Logo size={28} />
          </div>
          <div className="rounded-xl border border-border bg-card p-8">
            <h1 className="text-2xl font-bold text-white text-center">Create your account</h1>
            <p className="text-sm text-muted-foreground text-center mt-1">
              Start managing your household in minutes
            </p>

            <button
              onClick={handleGoogle}
              disabled={loading}
              className="mt-6 w-full flex items-center justify-center gap-3 h-11 rounded-lg bg-white text-black font-medium hover:bg-white/90 transition disabled:opacity-60"
            >
              Continue with Google
            </button>

            <div className="my-6 flex items-center gap-3 text-xs text-muted-foreground">
              <div className="h-px flex-1 bg-border" />
              or continue with email
              <div className="h-px flex-1 bg-border" />
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="name">Full name</Label>
                <Input id="name" required value={fullName} onChange={(e) => setFullName(e.target.value)} className="mt-1.5" />
              </div>
              <div>
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1.5" />
              </div>
              <div>
                <Label htmlFor="password">Password</Label>
                <div className="relative mt-1.5">
                  <Input
                    id="password"
                    type={showPw ? "text" : "password"}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pr-10"
                  />
                  <button type="button" onClick={() => setShowPw((s) => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                    {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                {password && (
                  <div className="mt-2">
                    <div className="h-1 rounded-full bg-muted overflow-hidden">
                      <div className="h-full transition-all" style={{ width: `${strength.pct}%`, background: strength.color }} />
                    </div>
                    <p className="text-xs mt-1" style={{ color: strength.color }}>{strength.label}</p>
                  </div>
                )}
              </div>
              <div>
                <Label htmlFor="confirm">Confirm password</Label>
                <div className="relative mt-1.5">
                  <Input
                    id="confirm"
                    type={showCf ? "text" : "password"}
                    required
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    className="pr-10"
                  />
                  <button type="button" onClick={() => setShowCf((s) => !s)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                    {showCf ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                {mismatch && <p className="text-xs text-destructive mt-1">Passwords don't match</p>}
              </div>
              <Button
                type="submit"
                disabled={loading || !!mismatch}
                className="w-full h-11 bg-primary text-primary-foreground hover:bg-primary/90"
              >
                {loading ? "Creating account..." : "Create account"}
              </Button>
            </form>

            <p className="mt-6 text-center text-sm text-muted-foreground">
              Already have an account?{" "}
              <Link to="/login" className="text-primary hover:underline">Sign in</Link>
            </p>
          </div>
        </div>
      </div>
    </PageTransition>
  );
}
