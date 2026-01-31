"use client";

import Link from "next/link";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ExternalLink } from "lucide-react";
import { getTrelloCardUrl } from "@/lib/trello";

export type JobsListRow = {
  id: string;
  trello_card_id: string | null;
  trello_list_id: string | null;
  production_stage: string | null;
  sales_status: string | null;
  payment_status: string | null;
  updated_at: string | null;
  lead: Array<{
    id: string;
    lead_id: string;
    customer_name: string | null;
    name: string | null;
    organization: string | null;
  }> | null;
};

interface JobsTableClientProps {
  jobs: JobsListRow[];
}

export function JobsTableClient({ jobs }: JobsTableClientProps) {
  return (
    <div className="w-full overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Job</TableHead>
            <TableHead>Customer</TableHead>
            <TableHead>Sales</TableHead>
            <TableHead>Stage</TableHead>
            <TableHead>Payment</TableHead>
            <TableHead className="text-right">Trello</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {jobs.map((job) => {
            const lead = job.lead?.[0] || null;
            const customer = lead?.customer_name || lead?.name || "Unknown";
            const org = lead?.organization || "";
            const trelloUrl = job.trello_card_id ? getTrelloCardUrl(job.trello_card_id) : null;
            return (
              <TableRow key={job.id}>
                <TableCell className="font-medium">
                  <Link href={`/jobs/${job.id}`} className="hover:underline">
                    {lead?.lead_id || job.id}
                  </Link>
                </TableCell>
                <TableCell>
                  <div className="flex flex-col">
                    <span className="font-medium">{customer}</span>
                    {org ? <span className="text-xs text-muted-foreground">{org}</span> : null}
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant="outline">{job.sales_status || "—"}</Badge>
                </TableCell>
                <TableCell>
                  <Badge>{job.production_stage || "—"}</Badge>
                </TableCell>
                <TableCell>
                  <Badge variant="secondary">{job.payment_status || "—"}</Badge>
                </TableCell>
                <TableCell className="text-right">
                  {trelloUrl ? (
                    <Button asChild variant="outline" size="sm" className="h-8 gap-2">
                      <a href={trelloUrl} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="h-4 w-4" />
                        Open
                      </a>
                    </Button>
                  ) : (
                    <span className="text-sm text-muted-foreground">—</span>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
