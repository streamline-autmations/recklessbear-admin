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
  new: { label: "New", className: "bg-[rgb(var(--background)/1)] text-[rgb(var(--foreground)/1)] border border-border" },
  assigned: { label: "Assigned", className: "bg-[rgb(var(--muted)/1)] text-[rgb(var(--foreground)/1)] border border-border" },
  contacted: { label: "Contacted", className: "bg-[rgb(var(--warning)/0.1)] text-[rgb(var(--foreground)/1)] border border-border" },
  quote_sent: { label: "Quote Sent", className: "bg-[rgb(var(--muted)/0.8)] text-[rgb(var(--foreground)/1)] border border-border" },
  quote_approved: { label: "Quote Approved", className: "bg-[rgb(var(--success)/0.1)] text-[rgb(var(--foreground)/1)] border border-border" },
  in_production: { label: "In Production", className: "bg-[rgb(var(--muted)/0.8)] text-[rgb(var(--foreground)/1)] border border-border" },
  completed: { label: "Completed", className: "bg-[rgb(var(--success)/0.2)] text-[rgb(var(--foreground)/1)] border border-border" },
  lost: { label: "Lost", className: "bg-[rgb(var(--destructive)/0.15)] text-[rgb(var(--foreground)/1)] border border-border" },
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
