import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import Logo from "@/components/Logo";
import PageTransition from "@/components/PageTransition";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/lib/supabase";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  const handle = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin + "/reset-password",
    });
    setLoading(false);
    if (error) setError(error.message);
    else setSent(true);
  };

  return (
    <PageTransition>
      <div className="hero-gradient dot-grid min-h-screen flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          <div className="flex justify-center mb-8"><Logo size={28} /></div>
          <div className="rounded-xl border border-border bg-card p-8">
            <Link to="/login" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-primary mb-4">
              <ArrowLeft size={16} /> Back to sign in
            </Link>
            <h1 className="text-2xl font-bold text-white">Forgot password?</h1>
            <p className="text-sm text-muted-foreground mt-1">
              We'll send you a link to reset it.
            </p>
            {sent ? (
              <div className="mt-6 rounded-lg border border-primary/30 bg-primary/10 p-4 flex gap-3 items-start">
                <CheckCircle2 className="text-primary shrink-0" size={20} />
                <div>
                  <p className="font-medium text-white">Check your inbox!</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    We've emailed a password reset link to {email}.
                  </p>
                </div>
              </div>
            ) : (
              <form onSubmit={handle} className="mt-6 space-y-4">
                <div>
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1.5" />
                </div>
                {error && <p className="text-sm text-destructive">{error}</p>}
                <Button type="submit" disabled={loading} className="w-full h-11 bg-primary text-primary-foreground hover:bg-primary/90">
                  {loading ? "Sending..." : "Send reset link"}
                </Button>
              </form>
            )}
          </div>
        </div>
      </div>
    </PageTransition>
  );
}
