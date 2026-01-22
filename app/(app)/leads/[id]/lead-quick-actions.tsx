"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Phone, Mail, Copy, Check, ExternalLink } from "lucide-react";
import { getTrelloCardUrl } from "@/lib/trello";
import { TrelloCreateButton } from "./trello-create-button";

interface LeadQuickActionsProps {
  phone: string | null;
  email: string | null;
  leadId: string;
  name: string | null;
  cardId?: string | null;
}

export function LeadQuickActions({
  phone,
  email,
  leadId,
  name,
  cardId,
}: LeadQuickActionsProps) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    const details = [
      `Lead ID: ${leadId}`,
      name ? `Name: ${name}` : null,
      phone ? `Phone: ${phone}` : null,
      email ? `Email: ${email}` : null,
    ]
      .filter(Boolean)
      .join("\n");

    navigator.clipboard.writeText(details).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  const trelloCardUrl = cardId ? getTrelloCardUrl(cardId) : null;

  return (
    <div className="flex flex-wrap gap-2 pb-2 border-b">
      {phone && (
        <Button
          variant="outline"
          size="sm"
          asChild
          className="min-h-[44px] gap-2"
        >
          <a href={`tel:${phone}`}>
            <Phone className="h-4 w-4" />
            <span>Call</span>
          </a>
        </Button>
      )}
      {email && (
        <Button
          variant="outline"
          size="sm"
          asChild
          className="min-h-[44px] gap-2"
        >
          <a href={`mailto:${email}`}>
            <Mail className="h-4 w-4" />
            <span>Email</span>
          </a>
        </Button>
      )}
      <Button
        variant="outline"
        size="sm"
        onClick={handleCopy}
        className="min-h-[44px] gap-2"
      >
        {copied ? (
          <>
            <Check className="h-4 w-4" />
            <span>Copied!</span>
          </>
        ) : (
          <>
            <Copy className="h-4 w-4" />
            <span>Copy Details</span>
          </>
        )}
      </Button>
      {cardId && trelloCardUrl && (
        <Button
          variant="outline"
          size="sm"
          asChild
          className="min-h-[44px] gap-2"
        >
          <a href={trelloCardUrl} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="h-4 w-4" />
            <span>Open Trello Card</span>
          </a>
        </Button>
      )}
      {!cardId && (
        <TrelloCreateButton leadId={leadId} leadName={name} />
      )}
    </div>
  );
}
