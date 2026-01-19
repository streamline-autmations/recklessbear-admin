import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function RootRedirectPage() {
  // #region agent log
  fetch("http://127.0.0.1:7242/ingest/e097c6e9-bf0c-44e8-9f10-2e038c010e7d", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      location: "app/page.tsx:7",
      message: "enter root redirect",
      data: {},
      timestamp: Date.now(),
      sessionId: "debug-session",
      runId: "hyp-01",
      hypothesisId: "A",
    }),
  }).catch(() => {});
  // #endregion agent log

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // #region agent log
  fetch("http://127.0.0.1:7242/ingest/e097c6e9-bf0c-44e8-9f10-2e038c010e7d", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      location: "app/page.tsx:15",
      message: "user retrieved",
      data: { user: user ? true : false, userId: user?.id },
      timestamp: Date.now(),
      sessionId: "debug-session",
      runId: "hyp-01",
      hypothesisId: "A",
    }),
  }).catch(() => {});
  // #endregion agent log

  if (user) {
    // #region agent log
    fetch("http://127.0.0.1:7242/ingest/e097c6e9-bf0c-44e8-9f10-2e038c010e7d", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        location: "app/page.tsx:21",
        message: "redirect to dashboard",
        data: { userId: user.id },
        timestamp: Date.now(),
        sessionId: "debug-session",
        runId: "hyp-01",
        hypothesisId: "A",
      }),
    }).catch(() => {});
    // #endregion agent log
    redirect("/dashboard");
  }

  redirect("/login");
}
