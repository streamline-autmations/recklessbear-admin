/**
 * Trello API utility functions
 * All Trello API calls should be server-side only
 */

const TRELLO_API_BASE = "https://api.trello.com/1";

/**
 * Get Trello card URL from card ID
 * This constructs the URL directly as Trello cards follow a predictable pattern
 */
export function getTrelloCardUrl(cardId: string): string {
  // Trello card URLs follow pattern: https://trello.com/c/{shortId}
  // The cardId from database might be the short ID or full ID
  // We'll use it as-is and Trello will handle it
  return `https://trello.com/c/${cardId}`;
}

/**
 * Create a Trello card via API
 * Requires TRELLO_API_KEY and TRELLO_TOKEN environment variables
 */
export async function createTrelloCard(params: {
  name: string;
  description?: string;
  listId?: string;
  boardId?: string;
}): Promise<{ id: string; url: string; shortUrl: string } | { error: string }> {
  const apiKey = process.env.TRELLO_API_KEY;
  const token = process.env.TRELLO_TOKEN;
  const defaultListId = process.env.TRELLO_DEFAULT_LIST_ID;

  if (!apiKey || !token) {
    return { error: "Trello API credentials not configured" };
  }

  const listId = params.listId || defaultListId;
  if (!listId) {
    return { error: "Trello list ID not configured" };
  }

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
    // Fallback: construct URL directly
    return { url: getTrelloCardUrl(cardId) };
  }

  try {
    const response = await fetch(
      `${TRELLO_API_BASE}/cards/${cardId}?key=${apiKey}&token=${token}&fields=url,shortUrl`
    );

    if (!response.ok) {
      // Fallback: construct URL directly
      return { url: getTrelloCardUrl(cardId) };
    }

    const card = await response.json();
    return { url: card.url || getTrelloCardUrl(cardId) };
  } catch (error) {
    console.error("[trello] Error fetching card:", error);
    // Fallback: construct URL directly
    return { url: getTrelloCardUrl(cardId) };
  }
}
