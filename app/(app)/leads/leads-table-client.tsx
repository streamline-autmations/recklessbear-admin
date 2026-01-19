"use client";

import { useState, useMemo } from "react";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import Link from "next/link";

interface Lead {
  id: string;
  lead_id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  status: string;
  created_at: string;
}

interface LeadsTableClientProps {
  initialLeads: Lead[];
}

export function LeadsTableClient({ initialLeads }: LeadsTableClientProps) {
  const [searchQuery, setSearchQuery] = useState("");

  // Client-side filtering
  const filteredLeads = useMemo(() => {
    if (!searchQuery.trim()) {
      return initialLeads;
    }

    const query = searchQuery.toLowerCase();
    return initialLeads.filter((lead) => {
      const name = lead.name?.toLowerCase() || "";
      const email = lead.email?.toLowerCase() || "";
      const phone = lead.phone?.toLowerCase() || "";
      const leadId = lead.lead_id?.toLowerCase() || "";

      return (
        name.includes(query) ||
        email.includes(query) ||
        phone.includes(query) ||
        leadId.includes(query)
      );
    });
  }, [initialLeads, searchQuery]);

  const formatDate = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    } catch {
      return dateString;
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <Input
          type="search"
          placeholder="Search by name, email, phone, or lead ID..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="min-h-[44px]"
        />
      </div>

      {/* Responsive table wrapper - horizontal scroll on mobile */}
      <div className="overflow-x-auto -mx-4 md:mx-0">
        <div className="inline-block min-w-full align-middle">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Lead ID</TableHead>
                <TableHead>Name</TableHead>
                <TableHead className="hidden sm:table-cell">Email</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead className="hidden md:table-cell">Status</TableHead>
                <TableHead className="hidden lg:table-cell">Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredLeads.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    {searchQuery ? "No leads found matching your search." : "No leads yet."}
                  </TableCell>
                </TableRow>
              ) : (
                filteredLeads.map((lead) => (
                  <TableRow key={lead.id}>
                    <TableCell>
                      <Link
                        href={`/leads/${lead.id}`}
                        className="font-medium text-primary hover:underline min-h-[44px] flex items-center"
                      >
                        {lead.lead_id}
                      </Link>
                    </TableCell>
                    <TableCell className="font-medium">
                      {lead.name || <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      {lead.email || <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell>
                      {lead.phone || <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <span className="inline-flex items-center rounded-md bg-muted px-2 py-1 text-xs font-medium">
                        {lead.status}
                      </span>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-muted-foreground">
                      {formatDate(lead.created_at)}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
