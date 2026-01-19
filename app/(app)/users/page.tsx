import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { UsersTableClient } from "./users-table-client";

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
  // #region agent log
  console.log("[USERS_PAGE] Page component loaded", { timestamp: Date.now() });
  fetch("http://127.0.0.1:7242/ingest/e097c6e9-bf0c-44e8-9f10-2e038c010e7d", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      location: "app/(app)/users/page.tsx:44",
      message: "UsersPage component loaded",
      data: {},
      timestamp: Date.now(),
      sessionId: "debug-session",
      runId: "users-debug-01",
      hypothesisId: "A",
    }),
  }).catch(() => {});
  // #endregion agent log

  const userRole = await getCurrentUserRole();
  
  // #region agent log
  console.log("[USERS_PAGE] User role checked", { userRole, timestamp: Date.now() });
  fetch("http://127.0.0.1:7242/ingest/e097c6e9-bf0c-44e8-9f10-2e038c010e7d", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      location: "app/(app)/users/page.tsx:46",
      message: "User role retrieved",
      data: { userRole },
      timestamp: Date.now(),
      sessionId: "debug-session",
      runId: "users-debug-01",
      hypothesisId: "A",
    }),
  }).catch(() => {});
  // #endregion agent log
  
  if (userRole !== "ceo" && userRole !== "admin") {
    // #region agent log
    console.log("[USERS_PAGE] Redirecting non-admin user", { userRole, timestamp: Date.now() });
    fetch("http://127.0.0.1:7242/ingest/e097c6e9-bf0c-44e8-9f10-2e038c010e7d", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        location: "app/(app)/users/page.tsx:47",
        message: "Redirecting non-admin/CEO user",
        data: { userRole },
        timestamp: Date.now(),
        sessionId: "debug-session",
        runId: "users-debug-01",
        hypothesisId: "A",
      }),
    }).catch(() => {});
    // #endregion agent log
    redirect("/dashboard");
  }

  const users = await getUsers();
  
  // #region agent log
  console.log("[USERS_PAGE] Users fetched", { count: users.length, timestamp: Date.now() });
  fetch("http://127.0.0.1:7242/ingest/e097c6e9-bf0c-44e8-9f10-2e038c010e7d", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      location: "app/(app)/users/page.tsx:51",
      message: "Users fetched successfully",
      data: { userCount: users.length },
      timestamp: Date.now(),
      sessionId: "debug-session",
      runId: "users-debug-01",
      hypothesisId: "A",
    }),
  }).catch(() => {});
  // #endregion agent log

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Users</h1>
        <p className="text-muted-foreground">Manage user profiles and roles.</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Users List</CardTitle>
        </CardHeader>
        <CardContent>
          <UsersTableClient initialUsers={users} />
        </CardContent>
      </Card>
    </div>
  );
}
