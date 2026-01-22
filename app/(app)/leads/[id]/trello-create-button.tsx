"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { createTrelloCardAction } from "./actions";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

interface TrelloCreateButtonProps {
  leadId: string;
  leadName: string | null;
}

export function TrelloCreateButton({ leadId }: TrelloCreateButtonProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleCreate() {
    startTransition(async () => {
      const formData = new FormData();
      // leadId should be UUID
      formData.set("leadId", leadId);
      const result = await createTrelloCardAction(formData);
      if (result && "error" in result) {
        toast.error(result.error);
      } else {
        toast.success("Trello card created successfully");
        router.refresh();
      }
    });
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleCreate}
      disabled={isPending}
      className="min-h-[44px] gap-2"
    >
      <Plus className="h-4 w-4" />
      <span>{isPending ? "Creating..." : "Create Trello Card"}</span>
    </Button>
  );
}
