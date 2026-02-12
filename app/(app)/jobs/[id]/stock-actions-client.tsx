"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { deductStockForJobAction } from "@/app/(app)/stock/actions";

type LineItem = {
  id: string;
  material_id: string;
  delta_qty: number;
  material?: { name: string; unit: string } | null;
};

export function JobStockActionsClient(props: {
  jobId: string;
  isAdmin: boolean;
  existingDeductionTransactionId: string | null;
  existingDeductionCreatedAt: string | null;
  existingLineItems: LineItem[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function readStatus(payload: unknown): string | null {
    if (!payload || typeof payload !== "object") return null;
    const status = (payload as Record<string, unknown>)["status"];
    return typeof status === "string" ? status : null;
  }

  function onDeduct() {
    startTransition(async () => {
      const result = await deductStockForJobAction(props.jobId);
      if (result?.error) {
        const msg = result.error.includes("bom_missing") ? "BOM is missing or incomplete for this job." : result.error;
        toast.error(msg);
        return;
      }

      const status = readStatus((result as { result?: unknown }).result);
      if (status === "already_deducted") {
        toast.message("Stock already deducted for this job");
      } else {
        toast.success("Stock deducted");
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {props.existingDeductionTransactionId ? (
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-medium">Already deducted</p>
                <p className="text-xs text-muted-foreground">
                  Transaction: {props.existingDeductionTransactionId}
                  {props.existingDeductionCreatedAt ? ` · ${new Date(props.existingDeductionCreatedAt).toLocaleString()}` : ""}
                </p>
              </div>
              <a href={`/jobs/${props.jobId}/stock-report`} className="text-sm font-medium underline underline-offset-4">
                Print Report
              </a>
            </div>
            {props.existingLineItems.length > 0 && (
              <div className="grid gap-2">
                {props.existingLineItems.map((li) => (
                  <div key={li.id} className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{li.material?.name || li.material_id}</span>
                    <span className={li.delta_qty < 0 ? "text-red-600" : "text-green-600"}>
                      {li.delta_qty > 0 ? "+" : ""}
                      {li.delta_qty} {li.material?.unit || ""}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-medium">Stock not deducted yet</p>
                <p className="text-xs text-muted-foreground">Run deduction once when the order starts production.</p>
              </div>
              <a href={`/jobs/${props.jobId}/stock-report`} className="text-sm font-medium underline underline-offset-4">
                Preview Report
              </a>
            </div>
            {props.isAdmin ? (
              <Button onClick={onDeduct} disabled={isPending}>
                {isPending ? "Deducting..." : "Deduct Stock"}
              </Button>
            ) : (
              <p className="text-sm text-muted-foreground">Read-only: ask an admin to deduct stock.</p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
