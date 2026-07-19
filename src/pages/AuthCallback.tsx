import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Logo from "@/components/Logo";
import { supabase } from "@/lib/supabase";

export default function AuthCallback() {
  const navigate = useNavigate();

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>;
    const resolve = async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        timeout = setTimeout(resolve, 250);
        return;
      }
      const uid = data.session.user.id;
      // Ensure profile exists
      const { data: existing } = await supabase
        .from("profiles")
        .select("id, family_id, full_name, email")
        .eq("id", uid)
        .maybeSingle();
      if (!existing) {
        await supabase.from("profiles").insert({
          id: uid,
          full_name: data.session.user.user_metadata.full_name ?? data.session.user.user_metadata.name ?? "",
          email: data.session.user.email,
          avatar_url: data.session.user.user_metadata.avatar_url ?? null,
        });
      }
      navigate(existing?.family_id ? "/dashboard" : "/onboarding", { replace: true });
    };
    resolve();
    return () => clearTimeout(timeout);
  }, [navigate]);

  return (
    <div className="hero-gradient dot-grid min-h-screen flex flex-col items-center justify-center gap-6">
      <Logo size={28} />
      <div className="flex items-center gap-3 text-muted-foreground">
        <div className="h-5 w-5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        Signing you in...
      </div>
    </div>
  );
}
