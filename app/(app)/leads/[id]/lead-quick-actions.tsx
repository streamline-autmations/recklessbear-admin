"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Phone, Mail, Copy, Check } from "lucide-react";

interface LeadQuickActionsProps {
  phone: string | null;
  email: string | null;
  leadId: string;
  name: string | null;
}

export function LeadQuickActions({
  phone,
  email,
  leadId,
  name,
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
    </div>
  );
}
