import { NextResponse } from "next/server";
import { createClient as createServerClient } from "@/lib/supabase/server";
import { sendPushToAllAdmins } from "@/lib/push";

export async function POST() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await sendPushToAllAdmins({
      title: "Test notification",
      body: "If you can see this, push is working.",
      url: "/leads",
      tag: "rb-test",
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to send";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
