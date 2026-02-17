/**
 * Trello API utility functions
 * All Trello API calls should be server-side only
 */

import { renderTrelloCardDescription } from "@/lib/trello-card-template";

const TRELLO_API_BASE = "https://api.trello.com/1";

// Trello List IDs mapping
export const TRELLO_LISTS = {
  ORDERS_AWAITING_CONFIRMATION: "688caf3f46d3b014e4913fb9",
  NO_INVOICE_NUMBER: "688caf3f46d3b014e4913fba",
  ORDERS: "688caf3f46d3b014e4913fbb",
  SUPPLIER_ORDERS: "688caf7a8ffde4839a951019",
  LAYOUTS_BUSY_COLLINE: "68ae5db69aebe84f388109db",
  LAYOUTS_BUSY_ELZANA: "68ae5dbedd735ca4eb472fd0",
  AWAITING_COLOR_MATCH: "68ae5dc5d89d3cacdd1cec13",
  LAYOUTS_DONE_AWAITING_APPROVAL: "68ae5dcd567bcaa25140cb1d",
  LAYOUTS_RECEIVED: "68ae5dd5267f5a1f3c44fe92",
  PRINTING: "68ae5ddba9caff070ab893a1",
  PRESSING: "68ae5de1f6b072287f954073",
  CMT: "68ae5de6795bf974bdf77208",
  CLEANING_PACKING: "68ae5df1464cf6e1d11cc5b6",
  COMPLETED: "68ae5df615ac84ce7469209c",
  FULL_PAYMENT_BEFORE_COLLECTION: "68ae5e022828b32fd969ca85",
  FULL_PAYMENT_BEFORE_DELIVERY: "68ae864412c82cf93534903f",
  READY_FOR_DELIVERY_COLLECTION: "68ae5e0eaf87030c27f97f04",
  OUT_FOR_DELIVERY: "68ae5e1dd55be494039722a5",
  DELIVERED_COLLECTED: "68ae5e2a43404cc8bb64abd4",
} as const;

// Map list IDs to production stages
export const LIST_ID_TO_STAGE: Record<string, string> = {
  "688caf3f46d3b014e4913fb9": "orders_awaiting_confirmation",
  "688caf3f46d3b014e4913fba": "no_invoice_number",
  "688caf3f46d3b014e4913fbb": "orders",
  "688caf7a8ffde4839a951019": "supplier_orders",
  "68ae5db69aebe84f388109db": "layouts_busy_colline",
  "68ae5dbedd735ca4eb472fd0": "layouts_busy_elzana",
  "68ae5dc5d89d3cacdd1cec13": "awaiting_color_match",
  "68ae5dcd567bcaa25140cb1d": "layouts_done_awaiting_approval",
  "68ae5dd5267f5a1f3c44fe92": "layouts_received",
  "68ae5ddba9caff070ab893a1": "printing",
  "68ae5de1f6b072287f954073": "pressing",
  "68ae5de6795bf974bdf77208": "cmt",
  "68ae5df1464cf6e1d11cc5b6": "cleaning_packing",
  "68ae5df615ac84ce7469209c": "completed",
  "68ae5e022828b32fd969ca85": "full_payment_before_collection",
  "68ae864412c82cf93534903f": "full_payment_before_delivery",
  "68ae5e0eaf87030c27f97f04": "ready_for_delivery_collection",
  "68ae5e1dd55be494039722a5": "out_for_delivery",
  "68ae5e2a43404cc8bb64abd4": "delivered_collected",
};

// Map production stages to list IDs
export const STAGE_TO_LIST_ID: Record<string, string> = Object.fromEntries(
  Object.entries(LIST_ID_TO_STAGE).map(([k, v]) => [v, k])
);

export interface JobCardData {
  leadId: string;
  jobId: string;
  customerName: string;
  organization?: string | null;
  email?: string | null;
  phone?: string | null;
  location?: string | null;
  invoiceNumber?: string | null;
  paymentStatus: string;
  orderQuantity?: number | null;
  orderDeadline?: string | null;
  productList?: string | null;
  designNotes?: string | null;
  productType?: string | null;
}

/**
 * Generate the structured card description with machine-readable data
 */
export function generateCardDescription(data: JobCardData): string {
  return renderTrelloCardDescription({
    INVOICE_NUMBER: data.invoiceNumber || "",
    PAYMENT_STATUS: data.paymentStatus || "Pending",
    JOB_ID: data.jobId,
    ORDER_QUANTITY: String(data.orderQuantity ?? ""),
    ORDER_DEADLINE: data.orderDeadline || "",
    PRODUCT_LIST: data.productList || "",
    CUSTOMER_NAME: data.customerName,
    PHONE: data.phone || "",
    EMAIL: data.email || "",
    ORGANIZATION: data.organization || "",
    LOCATION: data.location || "",
    DESIGN_NOTES: data.designNotes || "",
    LEAD_ID: data.leadId,
    INVOICE_MACHINE: data.invoiceNumber || "",
    ORDER_QUANTITY_MACHINE: String(data.orderQuantity ?? ""),
    ORDER_DEADLINE_MACHINE: data.orderDeadline || "",
  });
}

/**
 * Parse machine data from card description
 */
export function parseMachineData(description: string): Record<string, string> {
  const machineDataMatch = description.match(/<!-- MACHINE DATA - DO NOT EDIT -->\s*<!--\s*([\s\S]*?)\s*-->/);
  if (!machineDataMatch) return {};

  const lines = machineDataMatch[1].split("\n");
  const data: Record<string, string> = {};

  for (const line of lines) {
    const match = line.match(/^(\w+):\s*(.*)$/);
    if (match) {
      data[match[1]] = match[2].trim();
    }
  }

  return data;
}

/**
 * Generate card name in the required format
 */
export function generateCardName(data: {
  leadId: string;
  customerName: string;
  organization?: string | null;
  productType?: string | null;
}): string {
  const displayName = data.organization || data.customerName;
  const product = data.productType || "Custom Order";
  return `[${data.leadId}] - ${displayName} - ${product}`;
}

/**
 * Get Trello card URL from card ID
 */
export function getTrelloCardUrl(cardId: string): string {
  return `https://trello.com/c/${cardId}`;
}

/**
 * Create a Trello card for a job
 */
export async function createTrelloJobCard(data: JobCardData): Promise<
  { id: string; url: string; shortUrl: string; listId: string } | { error: string }
> {
  const apiKey = process.env.TRELLO_API_KEY;
  const token = process.env.TRELLO_TOKEN;

  if (!apiKey || !token) {
    return { error: "Trello API credentials not configured" };
  }

  // Determine starting list based on payment status
  const listId = data.paymentStatus === "Paid" 
    ? TRELLO_LISTS.ORDERS 
    : TRELLO_LISTS.ORDERS_AWAITING_CONFIRMATION;

  const cardName = generateCardName({
    leadId: data.leadId,
    customerName: data.customerName,
    organization: data.organization,
    productType: data.productType,
  });

  const cardDescription = generateCardDescription(data);

  try {
    const response = await fetch(`${TRELLO_API_BASE}/cards?key=${apiKey}&token=${token}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: cardName,
        desc: cardDescription,
        idList: listId,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[trello] Error creating card:", errorText);
      return { error: `Failed to create Trello card: ${response.statusText}` };
    }

    const card = await response.json();
    return {
      id: card.id,
      url: card.url,
      shortUrl: card.shortUrl,
      listId: listId,
    };
  } catch (error) {
    console.error("[trello] Error creating card:", error);
    return { error: error instanceof Error ? error.message : "Unknown error" };
  }
}

/**
 * Legacy function for backward compatibility
 */
export async function createTrelloCard(params: {
  name: string;
  description?: string;
  listId?: string;
  boardId?: string;
}): Promise<{ id: string; url: string; shortUrl: string } | { error: string }> {
  const apiKey = process.env.TRELLO_API_KEY;
  const token = process.env.TRELLO_TOKEN;
  const defaultListId = process.env.TRELLO_DEFAULT_LIST_ID || TRELLO_LISTS.ORDERS_AWAITING_CONFIRMATION;

  if (!apiKey || !token) {
    return { error: "Trello API credentials not configured" };
  }

  const listId = params.listId || defaultListId;

  try {
    const response = await fetch(`${TRELLO_API_BASE}/cards?key=${apiKey}&token=${token}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: params.name,
        desc: params.description || "",
        idList: listId,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[trello] Error creating card:", errorText);
      return { error: `Failed to create Trello card: ${response.statusText}` };
    }

    const card = await response.json();
    return {
      id: card.id,
      url: card.url,
      shortUrl: card.shortUrl,
    };
  } catch (error) {
    console.error("[trello] Error creating card:", error);
    return { error: error instanceof Error ? error.message : "Unknown error" };
  }
}

/**
 * Get Trello card details by ID
 */
export async function getTrelloCard(cardId: string): Promise<{ url: string } | { error: string }> {
  const apiKey = process.env.TRELLO_API_KEY;
  const token = process.env.TRELLO_TOKEN;

  if (!apiKey || !token) {
    return { url: getTrelloCardUrl(cardId) };
  }

  try {
    const response = await fetch(
      `${TRELLO_API_BASE}/cards/${cardId}?key=${apiKey}&token=${token}&fields=url,shortUrl`
    );

    if (!response.ok) {
      return { url: getTrelloCardUrl(cardId) };
    }

    const card = await response.json();
    return { url: card.url || getTrelloCardUrl(cardId) };
  } catch (error) {
    console.error("[trello] Error fetching card:", error);
    return { url: getTrelloCardUrl(cardId) };
  }
}

/**
 * Move a Trello card to a different list
 */
export async function moveTrelloCard(
  cardId: string,
  listId: string
): Promise<{ success: boolean } | { error: string }> {
  const apiKey = process.env.TRELLO_API_KEY;
  const token = process.env.TRELLO_TOKEN;

  if (!apiKey || !token) {
    return { error: "Trello API credentials not configured" };
  }

  try {
    const response = await fetch(
      `${TRELLO_API_BASE}/cards/${cardId}?key=${apiKey}&token=${token}`,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          idList: listId,
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[trello] Error moving card:", errorText);
      return { error: `Failed to move Trello card: ${response.statusText}` };
    }

    return { success: true };
  } catch (error) {
    console.error("[trello] Error moving card:", error);
    return { error: error instanceof Error ? error.message : "Unknown error" };
  }
}

/**
 * Update Trello card description
 */
export async function updateTrelloCardDescription(
  cardId: string,
  description: string
): Promise<{ success: boolean } | { error: string }> {
  const apiKey = process.env.TRELLO_API_KEY;
  const token = process.env.TRELLO_TOKEN;

  if (!apiKey || !token) {
    return { error: "Trello API credentials not configured" };
  }

  try {
    const response = await fetch(
      `${TRELLO_API_BASE}/cards/${cardId}?key=${apiKey}&token=${token}`,
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          desc: description,
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[trello] Error updating card:", errorText);
      return { error: `Failed to update Trello card: ${response.statusText}` };
    }

    return { success: true };
  } catch (error) {
    console.error("[trello] Error updating card:", error);
    return { error: error instanceof Error ? error.message : "Unknown error" };
  }
}
