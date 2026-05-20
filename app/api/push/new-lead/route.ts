import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { sendPushToAllAdmins } from "@/lib/push";

const schema = z
  .object({
    lead_id: z.string().optional().nullable(),
    customer_name: z.string().optional().nullable(),
    email: z.string().optional().nullable(),
    phone: z.string().optional().nullable(),
    organization: z.string().optional().nullable(),
    company_name: z.string().optional().nullable(),
    lead_type: z.string().optional().nullable(),
  })
  .passthrough();

function authorized(req: NextRequest): boolean {
  const secret = process.env.PUSH_WEBHOOK_SECRET;
  if (!secret) return false;
  return req.headers.get("x-push-secret") === secret;
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Invalid payload" },
      { status: 400 },
    );
  }

  const d = parsed.data;
  const typeLabel =
    d.lead_type === "quote"
      ? "Quote request"
      : d.lead_type === "call"
      ? "Call booked"
      : d.lead_type === "question"
      ? "Question"
      : "Lead";

  const name = d.customer_name?.trim() || "Unknown";
  const org = (d.organization || d.company_name || "").toString().trim();
  const detail = [`${typeLabel} from ${name}`, org, d.phone, d.email]
    .filter(Boolean)
    .join(" · ");

  try {
    const result = await sendPushToAllAdmins({
      title: "New lead assigned",
      body: detail,
      url: "/leads",
      tag: `lead-${d.lead_id || Date.now()}`,
      data: { lead_id: d.lead_id ?? null, lead_type: d.lead_type ?? null },
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to send";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
