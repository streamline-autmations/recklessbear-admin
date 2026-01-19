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
