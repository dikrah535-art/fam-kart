import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { toast } from "sonner";
import Logo from "@/components/Logo";
import PageTransition from "@/components/PageTransition";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";

function generateCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

export default function Onboarding() {
  const navigate = useNavigate();
  const { user, refreshProfile, loading: authLoading } = useAuth();
  const [params] = useSearchParams();
  const [mode, setMode] = useState<"create" | "join">("create");
  const [familyName, setFamilyName] = useState("");
  const [code, setCode] = useState(params.get("code") ?? "");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (params.get("code")) setMode("join");
  }, [params]);

  useEffect(() => {
    if (!authLoading && !user) navigate("/login");
  }, [authLoading, user, navigate]);

  const create = async () => {
    if (!user) return;
    if (!familyName.trim()) return toast.error("Enter a family name");
    setLoading(true);
    const invite = generateCode();
    const { data, error } = await supabase
      .from("families")
      .insert({ name: familyName.trim(), invite_code: invite, created_by: user.id })
      .select()
      .single();
    if (error || !data) {
      setLoading(false);
      return toast.error(error?.message ?? "Failed to create family");
    }
    const { error: pErr } = await supabase
      .from("profiles")
      .update({ family_id: data.id })
      .eq("id", user.id);
    setLoading(false);
    if (pErr) return toast.error(pErr.message);
    toast.success(`Welcome to ${data.name}!`);
    await refreshProfile();
    navigate("/dashboard");
  };

  const join = async () => {
    if (!user) return;
    const c = code.trim().toUpperCase();
    if (c.length !== 6) return toast.error("Enter a 6-digit code");
    setLoading(true);
    const { data, error } = await supabase
      .from("families")
      .select("id, name")
      .eq("invite_code", c)
      .maybeSingle();
    if (error || !data) {
      setLoading(false);
      return toast.error("Invalid invite code");
    }
    const { error: pErr } = await supabase
      .from("profiles")
      .update({ family_id: data.id })
      .eq("id", user.id);
    setLoading(false);
    if (pErr) return toast.error(pErr.message);
    toast.success(`Joined ${data.name}!`);
    await refreshProfile();
    navigate("/dashboard");
  };

  return (
    <PageTransition>
      <div className="hero-gradient dot-grid min-h-screen flex items-center justify-center p-6">
        <div className="w-full max-w-md">
          <div className="flex justify-center mb-8"><Logo size={28} /></div>
          <div className="rounded-xl border border-border bg-card p-8">
            <div className="flex gap-2 rounded-lg bg-muted p-1 mb-6">
              {(["create", "join"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={`flex-1 rounded-md py-2 text-sm font-medium transition ${
                    mode === m ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-white"
                  }`}
                >
                  {m === "create" ? "Create family" : "Join family"}
                </button>
              ))}
            </div>

            {mode === "create" ? (
              <motion.div
                key="create"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-4"
              >
                <div>
                  <h2 className="text-xl font-bold text-white">Create your family</h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    Give your household a name. You can invite others once you're in.
                  </p>
                </div>
                <Input
                  placeholder="e.g. The ABC Family"
                  value={familyName}
                  onChange={(e) => setFamilyName(e.target.value)}
                />
                <Button
                  onClick={create}
                  disabled={loading}
                  className="w-full h-11 bg-primary text-primary-foreground hover:bg-primary/90"
                >
                  {loading ? "Creating..." : "Create family"}
                </Button>
              </motion.div>
            ) : (
              <motion.div
                key="join"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-4"
              >
                <div>
                  <h2 className="text-xl font-bold text-white">Join a family</h2>
                  <p className="text-sm text-muted-foreground mt-1">
                    Enter the 6-digit invite code your family shared with you.
                  </p>
                </div>
                <Input
                  placeholder="ABC123"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  maxLength={6}
                  className="text-center text-2xl tracking-[0.4em] font-mono uppercase"
                />
                <Button
                  onClick={join}
                  disabled={loading}
                  className="w-full h-11 bg-primary text-primary-foreground hover:bg-primary/90"
                >
                  {loading ? "Joining..." : "Join family"}
                </Button>
              </motion.div>
            )}
          </div>
        </div>
      </div>
    </PageTransition>
  );
}
