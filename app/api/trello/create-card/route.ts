import { createClient } from "@/lib/supabase/server";
import { createTrelloCard } from "@/lib/trello";
import { revalidatePath } from "next/cache";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return Response.json({ error: "Not authenticated" }, { status: 401 });
  }

  // Check if user is CEO/Admin
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, full_name, email")
    .eq("user_id", user.id)
    .single();

  if (!profile || (profile.role !== "ceo" && profile.role !== "admin")) {
    return Response.json({ error: "Unauthorized" }, { status: 403 });
  }

  const modifierName = profile?.full_name || user.email || "Admin";

  const { searchParams } = new URL(request.url);
  const leadId = searchParams.get("leadId");

  if (!leadId) {
    return Response.json({ error: "Lead ID required" }, { status: 400 });
  }

  // Get lead details
  const { data: lead, error: leadError } = await supabase
    .from("leads")
    .select("id, lead_id, customer_name, name, card_id")
    .eq("id", leadId)
    .single();

  if (leadError || !lead) {
    return Response.json({ error: "Lead not found" }, { status: 404 });
  }

  if (lead.card_id) {
    return Response.json({ error: "Card already exists" }, { status: 400 });
  }

  // Create Trello card
  const cardName = `Lead: ${lead.customer_name || lead.name || lead.lead_id}`;
  const cardDescription = `Lead ID: ${lead.lead_id}\n\nCreated from RecklessBear Admin`;

  const result = await createTrelloCard({
    name: cardName,
    description: cardDescription,
  });

  if ("error" in result) {
    return Response.json({ error: result.error }, { status: 500 });
  }

  // Update lead with card info
  const { error: updateError } = await supabase
    .from("leads")
    .update({
      card_id: result.id,
      card_created: true,
      updated_at: new Date().toISOString(),
      last_modified: new Date().toISOString(),
      last_modified_by: modifierName,
    })
    .eq("id", leadId);

  if (updateError) {
    return Response.json({ error: "Failed to update lead" }, { status: 500 });
  }

  // Create event
  await supabase.from("lead_events").insert({
    lead_db_id: leadId,
    actor_user_id: user.id,
    event_type: "trello_card_created",
    payload: { cardId: result.id, cardUrl: result.url },
  });

  revalidatePath(`/leads/${lead.lead_id}`);
  
  // Redirect back to lead detail page
  return NextResponse.redirect(new URL(`/leads/${lead.lead_id}`, request.url));
}
