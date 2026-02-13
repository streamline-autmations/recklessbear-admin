"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { Lead } from "@/types/leads";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type Rep = {
  id: string;
  name: string | null;
  email?: string | null;
};

export function JobsTableClient({
  initialLeads,
}: {
  initialLeads: Lead[];
  reps: Rep[];
  currentUserId: string | null;
}) {
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return initialLeads;
    return initialLeads.filter((l) => {
      return (
        (l.lead_id || "").toLowerCase().includes(q) ||
        (l.customer_name || "").toLowerCase().includes(q) ||
        (l.name || "").toLowerCase().includes(q) ||
        (l.organization || "").toLowerCase().includes(q) ||
        (l.email || "").toLowerCase().includes(q) ||
        (l.phone || "").toLowerCase().includes(q) ||
        (l.production_stage || "").toLowerCase().includes(q)
      );
    });
  }, [initialLeads, search]);

  return (
    <div className="space-y-4">
      <Input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search by lead, customer, org, stage..."
        className="max-w-md"
      />

      <div className="rounded-md border hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Lead</TableHead>
              <TableHead>Customer</TableHead>
              <TableHead>Stage</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-10 text-muted-foreground">
                  No jobs found.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((lead) => (
                <TableRow key={lead.id || lead.lead_id}>
                  <TableCell className="font-medium">{lead.lead_id}</TableCell>
                  <TableCell>{lead.customer_name || lead.name || "—"}</TableCell>
                  <TableCell>{lead.production_stage || "—"}</TableCell>
                  <TableCell>{lead.sales_status || lead.status || "—"}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-2">
                      <Button asChild size="sm" variant="outline">
                        <Link href={`/leads/${lead.id || lead.lead_id}`}>View</Link>
                      </Button>
                      {lead.card_id && (
                        <Button asChild size="sm">
                          <a href={`https://trello.com/c/${lead.card_id}`} target="_blank" rel="noreferrer">
                            Trello
                          </a>
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="grid grid-cols-1 gap-3 md:hidden">
        {filtered.map((lead) => (
          <div key={lead.id || lead.lead_id} className="rounded-lg border border-border p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="font-semibold">{lead.customer_name || lead.name || "—"}</div>
                <div className="text-sm text-muted-foreground">{lead.lead_id}</div>
                <div className="text-sm mt-2">
                  <span className="text-muted-foreground">Stage: </span>
                  {lead.production_stage || "—"}
                </div>
                <div className="text-sm">
                  <span className="text-muted-foreground">Status: </span>
                  {lead.sales_status || lead.status || "—"}
                </div>
              </div>
            </div>
            <div className="mt-3 flex gap-2">
              <Button asChild size="sm" variant="outline" className="flex-1">
                <Link href={`/leads/${lead.id || lead.lead_id}`}>View</Link>
              </Button>
              {lead.card_id && (
                <Button asChild size="sm" className="flex-1">
                  <a href={`https://trello.com/c/${lead.card_id}`} target="_blank" rel="noreferrer">
                    Trello
                  </a>
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

