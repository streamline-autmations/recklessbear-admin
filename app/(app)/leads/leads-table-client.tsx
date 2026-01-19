"use client";

import { useState, useMemo } from "react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import Link from "next/link";
import StatusBadge from "@/components/status-badge";

interface Lead {
  id: string;
  lead_id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  status: string;
  lead_type: string | null;
  source: string | null;
  assigned_rep_id: string | null;
  assigned_rep_name: string | null;
  created_at: string;
}

interface LeadsTableClientProps {
  initialLeads: Lead[];
}

export function LeadsTableClient({ initialLeads }: LeadsTableClientProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [leadTypeFilter, setLeadTypeFilter] = useState<string>("all");

  // Get unique values for filters
  const statuses = useMemo(() => {
    const unique = new Set(initialLeads.map((lead) => lead.status).filter(Boolean));
    return Array.from(unique).sort();
  }, [initialLeads]);

  const leadTypes = useMemo(() => {
    const unique = new Set(initialLeads.map((lead) => lead.lead_type).filter(Boolean));
    return Array.from(unique).sort();
  }, [initialLeads]);

  // Client-side filtering
  const filteredLeads = useMemo(() => {
    let filtered = initialLeads;

    // Search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter((lead) => {
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
    }

    // Status filter
    if (statusFilter !== "all") {
      filtered = filtered.filter((lead) => lead.status === statusFilter);
    }

    // Lead type filter
    if (leadTypeFilter !== "all") {
      filtered = filtered.filter((lead) => lead.lead_type === leadTypeFilter);
    }

    return filtered;
  }, [initialLeads, searchQuery, statusFilter, leadTypeFilter]);

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
      <div className="flex flex-col gap-3 sm:flex-row">
        <Input
          type="search"
          placeholder="Search by name, email, phone, or lead ID..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="min-h-[44px] flex-1"
        />
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="min-h-[44px] w-full sm:w-[180px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {statuses.map((status) => (
              <SelectItem key={status} value={status}>
                {status}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {leadTypes.length > 0 && (
          <Select value={leadTypeFilter} onValueChange={setLeadTypeFilter}>
            <SelectTrigger className="min-h-[44px] w-full sm:w-[180px]">
              <SelectValue placeholder="Lead Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              {leadTypes.map((type) => (
                <SelectItem key={type} value={type}>
                  {type}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
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
                <TableHead className="hidden lg:table-cell">Assigned Rep</TableHead>
                <TableHead className="hidden lg:table-cell">Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredLeads.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                    {searchQuery || statusFilter !== "all" || leadTypeFilter !== "all"
                      ? "No leads found matching your filters."
                      : "No leads yet."}
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
                      <StatusBadge 
                        status={
                          (lead.status?.toLowerCase().replace(/\s+/g, "_") || "new") as 
                          "new" | "assigned" | "contacted" | "quote_sent" | "quote_approved" | "in_production" | "completed" | "lost"
                        } 
                      />
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      {lead.assigned_rep_name || <span className="text-muted-foreground">—</span>}
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
