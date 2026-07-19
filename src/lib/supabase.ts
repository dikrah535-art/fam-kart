import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://ykksfteehmjkqrtrqpot.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inlra3NmdGVlaG1qa3FydHJxcG90Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ0MzAxMDMsImV4cCI6MjEwMDAwNjEwM30.oNWAJNxRDCKwBzrlF0w5n6v1pzJ02aG-eHUy8bQVQVE";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
