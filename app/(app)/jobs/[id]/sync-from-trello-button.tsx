"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { syncJobFromTrelloAction } from "../actions";

export function SyncFromTrelloButton({ jobId }: { jobId: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleSync() {
    startTransition(async () => {
      const formData = new FormData();
      formData.set("jobId", jobId);
      const result = await syncJobFromTrelloAction(formData);
      if (result && "error" in result) {
        toast.error(result.error);
      } else {
        toast.success("Synced from Trello");
        router.refresh();
      }
    });
  }

  return (
    <Button onClick={handleSync} disabled={isPending} variant="outline" className="min-h-[44px]">
      {isPending ? "Syncing..." : "Sync from Trello"}
    </Button>
  );
}

