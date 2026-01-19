"use client";

import { cn } from "@/lib/utils";

type LeadStatus =
  | "new"
  | "assigned"
  | "contacted"
  | "quote_sent"
  | "quote_approved"
  | "in_production"
  | "completed"
  | "lost";

const statusStyles: Record<
  LeadStatus,
  { label: string; className: string }
> = {
  new: {
    label: "New",
    className: "bg-background text-foreground border border-border",
  },
  assigned: {
    label: "Assigned",
    className: "bg-muted text-foreground border border-border",
  },
  contacted: {
    label: "Contacted",
    className: "bg-amber-50 text-amber-900 border border-amber-200",
  },
  quote_sent: {
    label: "Quote Sent",
    className: "bg-indigo-50 text-indigo-900 border border-indigo-200",
  },
  quote_approved: {
    label: "Quote Approved",
    className: "bg-green-50 text-green-900 border border-green-200",
  },
  in_production: {
    label: "In Production",
    className: "bg-blue-50 text-blue-900 border border-blue-200",
  },
  completed: {
    label: "Completed",
    className: "bg-green-50 text-green-900 border border-green-200",
  },
  lost: {
    label: "Lost",
    className: "bg-red-50 text-red-900 border border-red-200",
  },
};

export function StatusBadge({ status }: { status: LeadStatus }) {
  const info = statusStyles[status] ?? statusStyles.new;
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-3 py-[2px] text-[11px] font-semibold uppercase tracking-[0.2em]",
        info.className
      )}
    >
      {info.label}
    </span>
  );
}

export type { LeadStatus };

export default StatusBadge;
