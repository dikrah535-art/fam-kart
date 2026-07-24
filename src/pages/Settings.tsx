import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Copy, LogOut, Save, Users } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import PageTransition from "@/components/PageTransition";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";

interface Family {
  id: string;
  name: string;
  invite_code: string;
}
interface Member {
  id: string;
  full_name: string | null;
  email: string | null;
  avatar_url: string | null;
}

export default function Settings() {
  const { profile, user, signOut, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const fid = profile?.family_id ?? null;

  const [fullName, setFullName] = useState(profile?.full_name ?? "");
  const [family, setFamily] = useState<Family | null>(null);
  const [familyName, setFamilyName] = useState("");
  const [members, setMembers] = useState<Member[]>([]);
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingFamily, setSavingFamily] = useState(false);

  useEffect(() => {
    setFullName(profile?.full_name ?? "");
  }, [profile?.full_name]);

  useEffect(() => {
    if (!fid) return;
    const load = async () => {
      const [{ data: f }, { data: m }] = await Promise.all([
        supabase.from("families").select("id,name,invite_code").eq("id", fid).maybeSingle(),
        supabase.from("profiles").select("id,full_name,email,avatar_url").eq("family_id", fid),
      ]);
      if (f) {
        setFamily(f as Family);
        setFamilyName((f as Family).name);
      }
      setMembers((m as Member[]) ?? []);
    };
    load();
  }, [fid]);

  const saveProfile = async () => {
    if (!user) return;
    setSavingProfile(true);
    const { error } = await supabase.from("profiles").update({ full_name: fullName.trim() }).eq("id", user.id);
    setSavingProfile(false);
    if (error) return toast.error(error.message);
    await refreshProfile();
    toast.success("Profile saved");
  };

  const saveFamily = async () => {
    if (!fid) return;
    setSavingFamily(true);
    const { error } = await supabase.from("families").update({ name: familyName.trim() }).eq("id", fid);
    setSavingFamily(false);
    if (error) return toast.error(error.message);
    toast.success("Family renamed");
  };

  const copyCode = async () => {
    if (!family) return;
    await navigator.clipboard.writeText(family.invite_code);
    toast.success("Invite code copied");
  };

  const handleSignOut = async () => {
    await signOut();
    toast.success("Signed out");
    navigate("/login");
  };

  return (
    <PageTransition>
      <div className="max-w-3xl mx-auto px-4 md:px-6 py-6 md:py-8 space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-white">Settings</h1>
          <p className="text-sm text-muted-foreground mt-1">Your profile and family workspace.</p>
        </div>

        {/* Profile */}
        <motion.section
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-xl border border-border bg-card p-5 space-y-4"
        >
          <div className="flex items-center gap-4">
            <div className="h-14 w-14 rounded-full bg-primary/20 text-primary flex items-center justify-center text-xl font-semibold">
              {(fullName || user?.email || "?")[0]?.toUpperCase()}
            </div>
            <div className="min-w-0">
              <div className="text-white font-semibold truncate">{fullName || "Unnamed"}</div>
              <div className="text-xs text-muted-foreground truncate">{user?.email}</div>
            </div>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Full name</label>
            <input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="mt-1 w-full bg-muted rounded-md px-3 py-2 text-sm outline-none border border-transparent focus:border-primary"
              placeholder="Your name"
            />
          </div>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={saveProfile}
              disabled={savingProfile || !fullName.trim()}
              className="inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-md bg-primary text-primary-foreground disabled:opacity-40 hover:brightness-110"
            >
              <Save size={14} /> Save profile
            </button>
          </div>
        </motion.section>

        {/* Family */}
        <motion.section
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="rounded-xl border border-border bg-card p-5 space-y-4"
        >
          <div className="flex items-center gap-2">
            <Users size={18} className="text-primary" />
            <h2 className="text-white font-semibold">Family workspace</h2>
          </div>

          <div>
            <label className="text-xs text-muted-foreground">Family name</label>
            <input
              value={familyName}
              onChange={(e) => setFamilyName(e.target.value)}
              className="mt-1 w-full bg-muted rounded-md px-3 py-2 text-sm outline-none border border-transparent focus:border-primary"
            />
          </div>

          {family && (
            <div>
              <label className="text-xs text-muted-foreground">Invite code</label>
              <div className="mt-1 flex items-center gap-2">
                <div className="flex-1 font-mono tracking-widest text-lg bg-muted rounded-md px-3 py-2 text-primary">
                  {family.invite_code}
                </div>
                <button
                  type="button"
                  onClick={copyCode}
                  className="inline-flex items-center gap-1.5 text-sm px-3 py-2 rounded-md border border-border text-muted-foreground hover:text-white hover:border-primary/50"
                >
                  <Copy size={14} /> Copy
                </button>
              </div>
              <p className="text-xs text-muted-foreground mt-1.5">
                Share this code with family members so they can join.
              </p>
            </div>
          )}

          <div>
            <div className="text-xs text-muted-foreground mb-2">Members ({members.length})</div>
            <div className="space-y-2">
              {members.map((m) => (
                <div key={m.id} className="flex items-center gap-3 rounded-md bg-muted/40 px-3 py-2">
                  <div className="h-8 w-8 rounded-full bg-primary/20 text-primary flex items-center justify-center text-sm font-semibold">
                    {(m.full_name || m.email || "?")[0]?.toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm text-white truncate">
                      {m.full_name || "Unnamed"}
                      {m.id === user?.id && <span className="text-xs text-muted-foreground ml-1">(you)</span>}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">{m.email}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              onClick={saveFamily}
              disabled={savingFamily || !familyName.trim()}
              className="inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-md bg-primary text-primary-foreground disabled:opacity-40 hover:brightness-110"
            >
              <Save size={14} /> Save family
            </button>
          </div>
        </motion.section>

        {/* Danger */}
        <section className="rounded-xl border border-border bg-card p-5">
          <button
            type="button"
            onClick={handleSignOut}
            className="inline-flex items-center gap-1.5 text-sm px-3 py-2 rounded-md border border-destructive/40 text-destructive hover:bg-destructive/10"
          >
            <LogOut size={14} /> Sign out
          </button>
        </section>
      </div>
    </PageTransition>
  );
}
