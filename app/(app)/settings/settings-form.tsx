"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { saveSettingsAction } from "./actions";

interface SettingsFormProps {
  initialWhatsapp: boolean;
  initialEmail: boolean;
  updatedAt: string | null;
}

export function SettingsForm({
  initialWhatsapp,
  initialEmail,
  updatedAt,
}: SettingsFormProps) {
  const router = useRouter();
  const [whatsappAlerts, setWhatsappAlerts] = useState(initialWhatsapp);
  const [emailAlerts, setEmailAlerts] = useState(initialEmail);
  const [isPending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    startTransition(async () => {
      try {
        await saveSettingsAction(formData);
        toast.success("Settings saved successfully");
        router.refresh();
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Failed to save settings"
        );
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-2">
        <Label htmlFor="whatsappAlertsEnabled">WhatsApp Alerts</Label>
        <label className="flex items-center gap-3">
          <input
            id="whatsappAlertsEnabled"
            name="whatsappAlertsEnabled"
            type="checkbox"
            checked={whatsappAlerts}
            onChange={(e) => setWhatsappAlerts(e.target.checked)}
            className="h-5 w-5 rounded border border-border bg-background text-primary focus:outline-none"
          />
          <span className="text-sm text-muted-foreground">
            Notify via WhatsApp when leads update
          </span>
        </label>
      </div>
      <div className="space-y-2">
        <Label htmlFor="emailAlertsEnabled">Email Alerts</Label>
        <label className="flex items-center gap-3">
          <input
            id="emailAlertsEnabled"
            name="emailAlertsEnabled"
            type="checkbox"
            checked={emailAlerts}
            onChange={(e) => setEmailAlerts(e.target.checked)}
            className="h-5 w-5 rounded border border-border bg-background text-primary focus:outline-none"
          />
          <span className="text-sm text-muted-foreground">
            Send email updates for important changes
          </span>
        </label>
      </div>
      {updatedAt && (
        <p className="text-xs text-muted-foreground">
          Last saved{" "}
          {new Date(updatedAt).toLocaleString("en-US", {
            dateStyle: "medium",
            timeStyle: "short",
          })}
        </p>
      )}
      <Button type="submit" disabled={isPending} className="min-h-[44px]">
        {isPending ? "Saving..." : "Save settings"}
      </Button>
    </form>
  );
}
