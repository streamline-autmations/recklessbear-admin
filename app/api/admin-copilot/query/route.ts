import { NextRequest, NextResponse } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";

type Entity = "lead" | "job" | "wa_conversation" | "wa_message" | "stock";
type Action = "search" | "get";
type Role = "ceo" | "admin" | "rep" | "unknown";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function jsonError(status: number, message: string) {
  return NextResponse.json({ success: false, error: message }, { status });
}

function getServiceClient() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createAdminClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

function requireAdminCopilotSecret(request: NextRequest) {
  const expected = process.env.ADMIN_COPILOT_SECRET;
  if (!expected) return { ok: false as const, status: 500, error: "Missing ADMIN_COPILOT_SECRET" };

  const authorization = request.headers.get("authorization") || "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  const provided = match?.[1] || "";

  if (!provided) return { ok: false as const, status: 401, error: "Unauthorized" };
  if (provided !== expected) return { ok: false as const, status: 401, error: "Unauthorized" };
  return { ok: true as const };
}

function clampLimit(limit: unknown) {
  const n = typeof limit === "number" ? limit : Number(limit);
  if (!Number.isFinite(n)) return 10;
  return Math.max(1, Math.min(25, Math.floor(n)));
}

function safeString(input: unknown) {
  if (typeof input !== "string") return "";
  return input.trim();
}

async function getRoleAndProfileIdByEmail(
  sb: NonNullable<ReturnType<typeof getServiceClient>>,
  email?: string
): Promise<{ role: Role; profile_id: string | null }> {
  const normalized = safeString(email);
  if (!normalized) return { role: "unknown", profile_id: null };

  const { data, error } = await sb
    .from("profiles")
    .select("user_id, role")
    .ilike("email", normalized)
    .maybeSingle();

  if (error) throw error;

  const roleValue = safeString(data?.role);
  const role: Role = roleValue === "ceo" || roleValue === "admin" || roleValue === "rep" ? roleValue : "unknown";
  const profile_id = safeString(data?.user_id) || null;

  return { role, profile_id };
}

export async function POST(request: NextRequest) {
  const auth = requireAdminCopilotSecret(request);
  if (!auth.ok) return jsonError(auth.status, auth.error);

  const sb = getServiceClient();
  if (!sb) return jsonError(500, "Missing SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) or SUPABASE_SERVICE_ROLE_KEY");

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "Invalid JSON body");
  }

  const bodyRecord = isRecord(body) ? body : {};

  const entity = safeString(bodyRecord.entity) as Entity;
  const action = safeString(bodyRecord.action) as Action;
  const filtersRecord = isRecord(bodyRecord.filters) ? bodyRecord.filters : {};
  const limit = clampLimit(bodyRecord.limit);

  const contextRecord = isRecord(bodyRecord.context) ? bodyRecord.context : {};
  const userEmail = safeString(contextRecord.user_email) || safeString(bodyRecord.user_email);

  if (!entity || !action) {
    return jsonError(400, "Missing entity or action");
  }

  if (!userEmail) {
    return jsonError(400, "Missing context.user_email");
  }

  let role: Role = "unknown";
  let profile_id: string | null = null;
  try {
    const resolved = await getRoleAndProfileIdByEmail(sb, userEmail);
    role = resolved.role;
    profile_id = resolved.profile_id;
  } catch (e) {
    return jsonError(500, e instanceof Error ? e.message : "Role lookup failed");
  }

  const isRep = role === "rep";
  const canSeeAll = role === "admin" || role === "ceo";

  if (!isRep && !canSeeAll) {
    return jsonError(403, "Insufficient permissions");
  }

  if (entity === "lead") {
    if (action === "get") {
      const id = safeString(filtersRecord.id) || safeString(filtersRecord.lead_uuid);
      const leadId = safeString(filtersRecord.lead_id);
      if (!id && !leadId) return jsonError(400, "Provide filters.id or filters.lead_id");

      let q = sb
        .from("leads")
        .select("id, lead_id, name, sales_status, assigned_rep_id, updated_at")
        .limit(1);

      if (id) q = q.eq("id", id);
      if (leadId) q = q.eq("lead_id", leadId);

      if (isRep) {
        if (!profile_id) return jsonError(403, "Rep profile not found");
        q = q.eq("assigned_rep_id", profile_id);
      }

      const { data, error } = await q.maybeSingle();
      if (error) return jsonError(500, error.message);
      if (!data) return NextResponse.json({ success: true, entity, count: 0, records: [] });

      const assignedRepId = safeString(data.assigned_rep_id);
      let assignedRep: string | null = null;
      if (assignedRepId) {
        const { data: rep } = await sb
          .from("profiles")
          .select("full_name, email")
          .eq("user_id", assignedRepId)
          .maybeSingle();
        assignedRep = safeString(rep?.full_name) || safeString(rep?.email) || null;
      }

      return NextResponse.json({
        success: true,
        entity,
        count: 1,
        records: [
          {
            id: safeString(data.id),
            lead_id: safeString(data.lead_id),
            customer_name: safeString(data.name),
            status: safeString(data.sales_status),
            assigned_rep: assignedRep,
            updated_at: typeof data.updated_at === "string" ? data.updated_at : null,
            link: `/leads/${safeString(data.id)}`,
          },
        ],
      });
    }

    if (action === "search") {
      const qText = safeString(filtersRecord.q).slice(0, 200);
      const email = safeString(filtersRecord.email);
      const phone = safeString(filtersRecord.phone);
      const leadId = safeString(filtersRecord.lead_id);
      const status = safeString(filtersRecord.sales_status) || safeString(filtersRecord.status);

      let q = sb
        .from("leads")
        .select("id, lead_id, name, sales_status, assigned_rep_id, updated_at")
        .order("updated_at", { ascending: false })
        .limit(limit);

      if (leadId) q = q.eq("lead_id", leadId);
      if (status) q = q.eq("sales_status", status);
      if (email) q = q.ilike("email", `%${email}%`);
      if (phone) q = q.ilike("phone", `%${phone}%`);

      if (qText) {
        const s = qText.replace(/,/g, " ");
        q = q.or(
          [
            `name.ilike.%${s}%`,
            `email.ilike.%${s}%`,
            `phone.ilike.%${s}%`,
            `lead_id.ilike.%${s}%`,
            `organization.ilike.%${s}%`,
          ].join(",")
        );
      }

      if (isRep) {
        if (!profile_id) return jsonError(403, "Rep profile not found");
        q = q.eq("assigned_rep_id", profile_id);
      }

      const { data, error } = await q;
      if (error) return jsonError(500, error.message);

      const leadsList: unknown[] = Array.isArray(data) ? data : [];
      const repIds = Array.from(
        new Set(
          leadsList
            .map((l) => (isRecord(l) ? safeString(l.assigned_rep_id) : ""))
            .filter((id) => typeof id === "string" && id)
        )
      );

      const repById: Record<string, string> = {};
      if (repIds.length) {
        const { data: reps, error: repsError } = await sb
          .from("profiles")
          .select("user_id, full_name, email")
          .in("user_id", repIds);

        if (repsError) return jsonError(500, repsError.message);

        const repsList: unknown[] = Array.isArray(reps) ? reps : [];
        repsList.forEach((r) => {
          if (!isRecord(r)) return;
          const userId = safeString(r.user_id);
          const label = safeString(r.full_name) || safeString(r.email);
          if (userId && label) repById[userId] = label;
        });
      }

      const records = leadsList.flatMap((l) => {
        if (!isRecord(l)) return [];
        const id = safeString(l.id);
        const lead_id = safeString(l.lead_id);
        if (!id || !lead_id) return [];

        const assignedRepId = safeString(l.assigned_rep_id);
        const assignedRep = assignedRepId ? repById[assignedRepId] || null : null;

        return {
          id,
          lead_id,
          customer_name: safeString(l.name),
          status: safeString(l.sales_status),
          assigned_rep: assignedRep,
          updated_at: typeof l.updated_at === "string" ? l.updated_at : null,
          link: `/leads/${id}`,
        };
      });

      return NextResponse.json({ success: true, entity, count: records.length, records });
    }

    return jsonError(400, "Unsupported action for entity=lead");
  }

  if (entity === "job" || entity === "wa_conversation" || entity === "wa_message" || entity === "stock") {
    return NextResponse.json({
      success: true,
      entity,
      count: 0,
      records: [],
      note: `${entity} queries not implemented yet`,
    });
  }

  return jsonError(400, "Unknown entity");
}
