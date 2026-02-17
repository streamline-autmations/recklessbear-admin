"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";

async function getAppBaseUrl() {
  const explicit = process.env.NEXT_PUBLIC_BASE_URL;
  if (explicit) return explicit.replace(/\/+$/, "");
  const vercel = process.env.VERCEL_URL;
  if (vercel) return `https://${vercel}`.replace(/\/+$/, "");
  try {
    const h = await headers();
    const host = h.get("x-forwarded-host") || h.get("host");
    if (host) {
      const proto = h.get("x-forwarded-proto") || "https";
      return `${proto}://${host}`.replace(/\/+$/, "");
    }
  } catch {
  }
  if (process.env.NODE_ENV === "development") return "http://localhost:3000";
  return null;
}

const updateUserSchema = z.object({
  userId: z.string().uuid(),
  fullName: z.string().min(1).max(255),
  phone: z.string().max(50).optional(),
  role: z.enum(["ceo", "admin", "rep"]),
});

export async function updateUserAction(
  formData: FormData
): Promise<{ error?: string } | void> {
  const rawFormData = {
    userId: formData.get("userId") as string,
    fullName: formData.get("fullName") as string,
    phone: formData.get("phone") as string,
    role: formData.get("role") as string,
  };

  const result = updateUserSchema.safeParse(rawFormData);
  if (!result.success) {
    return {
      error: result.error.issues[0]?.message || "Invalid input",
    };
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Not authenticated" };
  }

  // Check if user is CEO/Admin
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("user_id", user.id)
    .single();

  if (!profile || (profile.role !== "ceo" && profile.role !== "admin")) {
    return { error: "Unauthorized" };
  }

  // Prevent admin from removing their own admin role
  if (user.id === result.data.userId && result.data.role !== "admin" && profile.role === "admin") {
    return { error: "Cannot remove your own admin role" };
  }

  const { error: updateError } = await supabase
    .from("profiles")
    .update({
      full_name: result.data.fullName,
      phone: result.data.phone || null,
      role: result.data.role,
    })
    .eq("user_id", result.data.userId);

  if (updateError) {
    return { error: updateError.message || "Failed to update user" };
  }

  revalidatePath("/users");
}

const createUserSchema = z.object({
  email: z.string().email("Invalid email address"),
  fullName: z.string().min(1, "Full name is required").max(255),
  phone: z.string().max(50).optional(),
  role: z.enum(["ceo", "admin", "rep"]),
});

const deleteUserSchema = z.object({
  userId: z.string().uuid(),
});

export async function createUserAction(
  formData: FormData
): Promise<{ error?: string; userId?: string } | void> {
  const rawFormData = {
    email: formData.get("email") as string,
    fullName: formData.get("fullName") as string,
    phone: formData.get("phone") as string,
    role: formData.get("role") as string,
  };

  const result = createUserSchema.safeParse(rawFormData);
  if (!result.success) {
    return {
      error: result.error.issues[0]?.message || "Invalid input",
    };
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Not authenticated" };
  }

  // Check if user is CEO (only CEO can create users)
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("user_id", user.id)
    .single();

  if (!profile || profile.role !== "ceo") {
    return { error: "Unauthorized: Only CEO can create users" };
  }

  // Use Supabase Admin API (service role key) to create user
  // This must be done server-side only, never expose service role key to client
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;

  if (!SUPABASE_SERVICE_ROLE_KEY || !SUPABASE_URL) {
    return { error: "Server configuration error: Missing Supabase credentials" };
  }

  // Create admin client for user creation
  const { createClient: createAdminClient } = await import("@supabase/supabase-js");
  const adminClient = createAdminClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const baseUrl = await getAppBaseUrl();
  if (!baseUrl) {
    return { error: "Missing NEXT_PUBLIC_BASE_URL (or VERCEL_URL) for invite redirect" };
  }

  // Create auth user (invite via email)
  const { data: authUser, error: authError } = await adminClient.auth.admin.inviteUserByEmail(
    result.data.email,
    {
      redirectTo: `${baseUrl}/auth/callback`,
      data: {
        full_name: result.data.fullName,
        role: result.data.role,
      },
    }
  );

  if (authError || !authUser?.user) {
    return { error: authError?.message || "Failed to create user" };
  }

  // Upsert profile with role and name
  const { error: profileError } = await adminClient
    .from("profiles")
    .upsert({
      user_id: authUser.user.id,
      full_name: result.data.fullName,
      email: result.data.email,
      phone: result.data.phone || null,
      role: result.data.role,
    }, {
      onConflict: "user_id",
    });

  if (profileError) {
    // If profile creation fails, try to clean up auth user
    await adminClient.auth.admin.deleteUser(authUser.user.id);
    return { error: profileError.message || "Failed to create user profile" };
  }

  // Also upsert into users table if it exists (for rep assignment)
  // This table is deprecated in favor of profiles, but keeping for compatibility if needed
  // Only if the table actually exists in this schema version
  
  // No longer syncing to 'users' table as we migrated to 'profiles'
  
  revalidatePath("/users");
  return { userId: authUser.user.id };
}

export async function deleteUserAction(
  formData: FormData
): Promise<{ error?: string } | void> {
  const rawFormData = {
    userId: formData.get("userId") as string,
  };

  const result = deleteUserSchema.safeParse(rawFormData);
  if (!result.success) {
    return {
      error: result.error.issues[0]?.message || "Invalid input",
    };
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { error: "Not authenticated" };
  }

  if (user.id === result.data.userId) {
    return { error: "You cannot delete your own user" };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("user_id", user.id)
    .single();

  if (!profile || profile.role !== "ceo") {
    return { error: "Unauthorized: Only CEO can delete users" };
  }

  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;

  if (!SUPABASE_SERVICE_ROLE_KEY || !SUPABASE_URL) {
    return { error: "Server configuration error: Missing Supabase credentials" };
  }

  const { createClient: createAdminClient } = await import("@supabase/supabase-js");
  const adminClient = createAdminClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const nullOut = async (table: string, column: string) => {
    try {
      const { error } = await adminClient
        .from(table)
        .update({ [column]: null })
        .eq(column, result.data.userId);
      if (!error) return;
      const msg = String(error.message || "").toLowerCase();
      if (msg.includes("does not exist") || msg.includes("relation") || msg.includes("schema cache")) return;
    } catch {
    }
  };

  await Promise.all([
    nullOut("leads", "assigned_rep_id"),
    nullOut("lead_events", "actor_user_id"),
    nullOut("lead_notes", "author_user_id"),
    nullOut("wa_conversations", "assigned_rep_id"),
    nullOut("wa_messages", "created_by"),
    nullOut("stock_transactions", "created_by"),
    nullOut("stock_movements", "created_by"),
  ]);

  const { error: authError } = await adminClient.auth.admin.deleteUser(result.data.userId);
  if (authError) {
    return { error: authError.message || "Failed to delete user" };
  }

  const { error: profileDeleteError } = await adminClient
    .from("profiles")
    .delete()
    .eq("user_id", result.data.userId);
  if (profileDeleteError) {
    return { error: profileDeleteError.message || "Failed to delete user profile" };
  }

  const { error: legacyUsersDeleteError } = await adminClient
    .from("users")
    .delete()
    .eq("id", result.data.userId);
  if (legacyUsersDeleteError && !legacyUsersDeleteError.message.toLowerCase().includes("does not exist")) {
    return { error: legacyUsersDeleteError.message || "Failed to delete legacy user record" };
  }

  revalidatePath("/users");
}
