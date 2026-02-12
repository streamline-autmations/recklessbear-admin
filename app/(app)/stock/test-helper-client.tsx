"use client";

import { useState, useTransition } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { deductStockForJobAction } from "./actions";

export function StockTestHelperClient() {
  const [jobId, setJobId] = useState("");
  const [isPending, startTransition] = useTransition();
  const [showCommands, setShowCommands] = useState(false);

  function handleDeduct() {
    const trimmed = jobId.trim();
    if (!trimmed) return;
    startTransition(async () => {
      const result = await deductStockForJobAction(trimmed);
      if (result && "error" in result) {
        toast.error(result.error);
        return;
      }
      toast.success("Deduction triggered");
    });
  }

  return (
    <Card className="border-border shadow-sm">
      <CardHeader>
        <CardTitle className="text-base">Test Helper (Admin Only)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-2">
          <Label htmlFor="jobId">Job ID (UUID)</Label>
          <Input id="jobId" value={jobId} onChange={(e) => setJobId(e.target.value)} placeholder="Paste job UUID..." />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={handleDeduct} disabled={isPending || !jobId.trim()}>
            {isPending ? "Running..." : "Deduct Stock (RPC)"}
          </Button>
          <Button variant="outline" onClick={() => setShowCommands((v) => !v)}>
            {showCommands ? "Hide Commands" : "Show Seed/Verify Commands"}
          </Button>
        </div>
        {showCommands && (
          <div className="space-y-2 text-sm text-muted-foreground">
            <div>Seed TEST data (remote): npx tsx scripts/seedStockTestData.ts</div>
            <div>Verify deduction + idempotency: npx tsx scripts/verifyStockDeduction.ts</div>
            <div>Cleanup TEST data: npx tsx scripts/cleanupStockTestData.ts</div>
            <div>Required env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ALLOW_TEST_SEED_IN_REMOTE=true</div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

