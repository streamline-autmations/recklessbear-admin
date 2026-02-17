import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CreateUserForm } from "./create-user-form";
import { PageHeader } from "@/components/page-header";

async function getCurrentUserRole(): Promise<string | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("profiles")
    .select("role")
    .eq("user_id", user.id)
    .single();

  return data?.role || null;
}

export default async function CreateUserPage() {
  const userRole = await getCurrentUserRole();
  
  if (userRole !== "ceo" && userRole !== "admin") {
    redirect("/users");
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Create User" subtitle="Invite a new user to the system." />
      <CreateUserForm />
    </div>
  );
}
