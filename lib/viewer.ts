"use server";

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

type ViewerProfile = {
  full_name: string | null;
  role: string | null;
  email?: string | null;
} | null;

export const getViewer = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let profile: ViewerProfile = null;
  if (user) {
    const { data } = await supabase
      .from("profiles")
      .select("full_name, role, email")
      .eq("user_id", user.id)
      .single();
    profile = (data as ViewerProfile) || null;
  }

  const userName = profile?.full_name || user?.email || "RecklessBear";
  const userRole = profile?.role || "team";

  return { supabase, user, profile, userName, userRole };
});

