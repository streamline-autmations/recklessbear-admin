import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { UsersTableClient } from "./users-table-client";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";

interface Profile {
  user_id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  role: string;
  created_at: string;
}

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

async function getUsers(): Promise<Profile[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("user_id, full_name, email, phone, role, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Error fetching users:", error);
    return [];
  }

  return data || [];
}

export default async function UsersPage() {
  const userRole = await getCurrentUserRole();
  
  if (userRole !== "ceo" && userRole !== "admin") {
    redirect("/dashboard");
  }

  const users = await getUsers();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Users"
        subtitle="Manage user profiles and roles."
        actions={
          userRole === "ceo" || userRole === "admin" ? (
            <Button asChild className="min-h-[44px]">
              <Link href="/users/new">Create User</Link>
            </Button>
          ) : null
        }
      />
      <Card>
        <CardHeader>
          <CardTitle>Users List</CardTitle>
        </CardHeader>
        <CardContent>
          <UsersTableClient initialUsers={users} currentUserRole={userRole} />
        </CardContent>
      </Card>
    </div>
  );
}
