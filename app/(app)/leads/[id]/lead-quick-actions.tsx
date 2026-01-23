"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Phone, Mail, Copy, Check, ExternalLink, UserPlus } from "lucide-react";
import { getTrelloCardUrl } from "@/lib/trello";
import { TrelloCreateButton } from "./trello-create-button";
import { autoAssignLeadAction } from "./actions";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

interface LeadQuickActionsProps {
  phone: string | null;
  email: string | null;
  leadId: string;
  dbId?: string;
  name: string | null;
  cardId?: string | null;
  isCeoOrAdmin?: boolean;
  assignedRepId?: string | null;
}

export function LeadQuickActions({
  phone,
  email,
  leadId,
  dbId,
  name,
  cardId,
  isCeoOrAdmin,
  assignedRepId,
}: LeadQuickActionsProps) {
  const [copied, setCopied] = useState(false);
  const [isAutoAssignPending, startAutoAssignTransition] = useTransition();
  const router = useRouter();

  function handleCopy() {
    navigator.clipboard.writeText(leadId).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function handleAutoAssign() {
    if (!dbId) return;
    
    startAutoAssignTransition(async () => {
      const formData = new FormData();
      formData.set("leadId", dbId);

      const result = await autoAssignLeadAction(formData);
      if (result && "error" in result) {
        toast.error(result.error);
      } else if (result && "repId" in result) {
        router.refresh();
        toast.success("Lead auto-assigned successfully");
      }
    });
  }

  const trelloCardUrl = cardId ? getTrelloCardUrl(cardId) : null;

  return (
    <div className="flex flex-wrap gap-2 pb-2">
      {phone && (
        <Button
          variant="outline"
          size="sm"
          asChild
          className="min-h-[36px] h-9 gap-2"
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
          className="min-h-[36px] h-9 gap-2"
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
        className="min-h-[36px] h-9 gap-2"
      >
        {copied ? (
          <>
            <Check className="h-4 w-4" />
            <span>Copied!</span>
          </>
        ) : (
          <>
            <Copy className="h-4 w-4" />
            <span>Copy ID</span>
          </>
        )}
      </Button>
      {cardId && trelloCardUrl && (
        <Button
          variant="outline"
          size="sm"
          asChild
          className="min-h-[36px] h-9 gap-2"
        >
          <a href={trelloCardUrl} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="h-4 w-4" />
            <span>Open Trello</span>
          </a>
        </Button>
      )}
      {!cardId && (
        <TrelloCreateButton leadId={leadId} leadName={name} />
      )}
      
      {isCeoOrAdmin && !assignedRepId && dbId && (
        <Button
          variant="outline"
          size="sm"
          onClick={handleAutoAssign}
          disabled={isAutoAssignPending}
          className="min-h-[36px] h-9 gap-2"
        >
          <UserPlus className="h-4 w-4" />
          <span>{isAutoAssignPending ? "Assigning..." : "Auto-Assign"}</span>
        </Button>
      )}
    </div>
  );
}
