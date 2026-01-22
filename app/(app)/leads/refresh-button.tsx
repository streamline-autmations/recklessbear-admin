"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { RefreshCw } from "lucide-react";
import { useTransition } from "react";

export function RefreshButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleRefresh() {
    startTransition(() => {
      router.refresh();
    });
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleRefresh}
      disabled={isPending}
      className="min-h-[44px] gap-2"
    >
      <RefreshCw className={`h-4 w-4 ${isPending ? "animate-spin" : ""}`} />
      <span>{isPending ? "Refreshing..." : "Refresh"}</span>
    </Button>
  );
}
