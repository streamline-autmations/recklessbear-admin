"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";

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

  // Create auth user (invite via email)
  const { data: authUser, error: authError } = await adminClient.auth.admin.inviteUserByEmail(
    result.data.email,
    {
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
  const { error: usersError } = await adminClient
    .from("users")
    .upsert({
      id: authUser.user.id,
      name: result.data.fullName,
      email: result.data.email,
    }, {
      onConflict: "id",
    });

  // Log warning if users table update fails, but don't fail the whole operation
  if (usersError) {
    console.warn("Failed to update users table:", usersError);
  }

  revalidatePath("/users");
  return { userId: authUser.user.id };
}
