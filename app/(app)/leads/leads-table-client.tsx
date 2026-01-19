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
import { Button } from "@/components/ui/button";
import StatusBadge from "@/components/status-badge";
import { X } from "lucide-react";

import type { Lead } from '@/types/leads';

interface DisplayLead extends Lead {
  id?: string;
  lead_id: string;
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  status?: string | null;
  lead_type?: string | null;
  source?: string | null;
  assigned_rep_id?: string | null;
  assigned_rep_name?: string | null;
  created_at?: string | null;
  submission_date?: string | null;
}

interface Rep {
  user_id: string;
  full_name: string | null;
}

interface LeadsTableClientProps {
  initialLeads: DisplayLead[];
  reps: Rep[];
}

export function LeadsTableClient({ initialLeads, reps }: LeadsTableClientProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [leadTypeFilter, setLeadTypeFilter] = useState<string>("all");
  const [assignedRepFilter, setAssignedRepFilter] = useState<string>("all");

  // Get unique values for filters
  const statuses = useMemo(() => {
    const unique = new Set(initialLeads.map((lead) => lead.status || "").filter(Boolean));
    return Array.from(unique).sort();
  }, [initialLeads]);

  const leadTypes = useMemo(() => {
    const unique = new Set(initialLeads.map((lead) => lead.lead_type || "").filter(Boolean));
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
      filtered = filtered.filter((lead) => (lead.status || "").toLowerCase() === statusFilter.toLowerCase());
    }

    // Lead type filter
    if (leadTypeFilter !== "all") {
      filtered = filtered.filter((lead) => (lead.lead_type || "").toLowerCase() === leadTypeFilter.toLowerCase());
    }

    // Assigned rep filter
    if (assignedRepFilter !== "all") {
      if (assignedRepFilter === "unassigned") {
        filtered = filtered.filter((lead) => !lead.assigned_rep_id);
      } else {
        filtered = filtered.filter((lead) => lead.assigned_rep_id === assignedRepFilter);
      }
    }

    return filtered;
  }, [initialLeads, searchQuery, statusFilter, leadTypeFilter, assignedRepFilter]);

  function clearFilters() {
    setSearchQuery("");
    setStatusFilter("all");
    setLeadTypeFilter("all");
    setAssignedRepFilter("all");
  }

  const hasActiveFilters = searchQuery || statusFilter !== "all" || leadTypeFilter !== "all" || assignedRepFilter !== "all";

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
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          <Input
            type="search"
            placeholder="Search by name, email, phone, or lead ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="min-h-[44px] flex-1 min-w-[200px]"
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
          {reps.length > 0 && (
            <Select value={assignedRepFilter} onValueChange={setAssignedRepFilter}>
              <SelectTrigger className="min-h-[44px] w-full sm:w-[180px]">
                <SelectValue placeholder="Assigned Rep" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Reps</SelectItem>
                <SelectItem value="unassigned">Unassigned</SelectItem>
                {reps.map((rep) => (
                  <SelectItem key={rep.user_id} value={rep.user_id}>
                    {rep.full_name || rep.user_id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {hasActiveFilters && (
            <Button
              variant="outline"
              onClick={clearFilters}
              className="min-h-[44px] gap-2"
            >
              <X className="h-4 w-4" />
              Clear Filters
            </Button>
          )}
        </div>
      </div>

      {/* Responsive table wrapper - horizontal scroll on mobile */}
      <div className="overflow-x-auto -mx-4 md:mx-0">
        <div className="inline-block min-w-full align-middle">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Lead ID</TableHead>
                <TableHead>Name</TableHead>
                <TableHead className="hidden sm:table-cell">Lead Type</TableHead>
                <TableHead className="hidden md:table-cell">Status</TableHead>
                <TableHead className="hidden lg:table-cell">Assigned Rep</TableHead>
                <TableHead className="hidden lg:table-cell">Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredLeads.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                    {hasActiveFilters
                      ? "No leads found matching your filters."
                      : "No leads yet."}
                  </TableCell>
                </TableRow>
              ) : (
                filteredLeads.map((lead) => (
                  <TableRow key={lead.id || lead.lead_id}>
                    <TableCell>
                      <Link
                        href={`/leads/${lead.lead_id}`}
                        className="font-medium text-primary hover:underline min-h-[44px] flex items-center"
                      >
                        {lead.lead_id}
                      </Link>
                    </TableCell>
                    <TableCell className="font-medium">
                      {lead.name || <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      {lead.lead_type ? (
                        <span className="inline-flex items-center rounded-md bg-muted px-2 py-1 text-xs font-medium">
                          {lead.lead_type}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <StatusBadge 
                        status={
                          ((lead.status || "new")?.toLowerCase().replace(/\s+/g, "_") || "new") as 
                          "new" | "assigned" | "contacted" | "quote_sent" | "quote_approved" | "in_production" | "completed" | "lost"
                        } 
                      />
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      {lead.assigned_rep_name || lead.assigned_rep_id || <span className="text-muted-foreground">—</span>}
                    </TableCell>
                    <TableCell className="hidden lg:table-cell text-muted-foreground">
                      {formatDate(lead.created_at || lead.submission_date || new Date().toISOString())}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        asChild
                        variant="outline"
                        size="sm"
                        className="min-h-[44px]"
                      >
                        <Link href={`/leads/${lead.lead_id}`}>View</Link>
                      </Button>
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
