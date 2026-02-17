"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { autoAssignAllLeadsAction } from "./actions";

export function AutoAssignAllButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    if (!window.confirm("Auto-assign all unassigned leads from the last 2 months?")) return;

    startTransition(async () => {
      const result = await autoAssignAllLeadsAction();
      if (result && "error" in result && result.error) {
        toast.error(result.error);
        return;
      }
      const assigned = result && "assigned" in result ? result.assigned : null;
      toast.success(typeof assigned === "number" ? `Auto-assigned ${assigned} leads` : "Auto-assigned leads");
      router.refresh();
    });
  }

  return (
    <Button type="button" disabled={isPending} onClick={handleClick}>
      {isPending ? "Assigning..." : "Auto-Assign Leads"}
    </Button>
  );
}

